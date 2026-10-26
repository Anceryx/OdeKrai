use serde_json::Value;

/// Camada que separa a validação e o despacho dos efeitos nativos do Windows.
pub(crate) trait SystemAdapter {
    fn volume(&mut self) -> Result<u8, String>;
    fn set_volume(&mut self, value: u8) -> Result<(), String>;
    fn mute(&mut self, muted: bool) -> Result<(), String>;
    fn media_key(&mut self, key: MediaKey) -> Result<(), String>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MediaKey {
    PlayPause,
    Next,
    Previous,
}

pub(crate) fn execute_with<A: SystemAdapter>(
    adapter: &mut A,
    skill_id: &str,
    params: &Value,
) -> Result<String, String> {
    match skill_id {
        "audio.get_volume" => Ok(format!("Volume principal: {}%.", adapter.volume()?)),
        "audio.set_volume" => {
            let value = params["volume"]
                .as_u64()
                .ok_or("Informe um volume entre 0 e 100.")?;
            if value > 100 {
                return Err("O volume precisa estar entre 0 e 100.".into());
            }
            adapter.set_volume(value as u8)?;
            Ok(format!("Volume definido para {value}%"))
        }
        "audio.mute" => {
            let muted = params["muted"]
                .as_bool()
                .ok_or("Informe se o áudio deve ficar sem som.")?;
            adapter.mute(muted)?;
            Ok(if muted {
                "Áudio silenciado."
            } else {
                "Áudio reativado."
            }
            .into())
        }
        "media.play_pause" => {
            adapter.media_key(MediaKey::PlayPause)?;
            Ok("Comando de reproduzir/pausar enviado.".into())
        }
        "media.next" => {
            adapter.media_key(MediaKey::Next)?;
            Ok("Comando de próxima faixa enviado.".into())
        }
        "media.previous" => {
            adapter.media_key(MediaKey::Previous)?;
            Ok("Comando de faixa anterior enviado.".into())
        }
        _ => Err("Habilidade de controle local desconhecida.".into()),
    }
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct SimulatedAdapter {
    pub volume: u8,
    pub muted: bool,
    pub media_commands: Vec<MediaKey>,
}

#[cfg(test)]
impl SystemAdapter for SimulatedAdapter {
    fn volume(&mut self) -> Result<u8, String> {
        Ok(self.volume)
    }
    fn set_volume(&mut self, value: u8) -> Result<(), String> {
        self.volume = value;
        Ok(())
    }
    fn mute(&mut self, muted: bool) -> Result<(), String> {
        self.muted = muted;
        Ok(())
    }
    fn media_key(&mut self, key: MediaKey) -> Result<(), String> {
        self.media_commands.push(key);
        Ok(())
    }
}

pub(crate) fn execute(skill_id: &str, params: &Value) -> Result<String, String> {
    execute_with(&mut NativeAdapter, skill_id, params)
}

#[cfg(windows)]
struct NativeAdapter;

#[cfg(windows)]
impl SystemAdapter for NativeAdapter {
    fn volume(&mut self) -> Result<u8, String> {
        on_audio_thread(|endpoint| unsafe { endpoint.GetMasterVolumeLevelScalar() })
            .map(|value| (value.clamp(0.0, 1.0) * 100.0).round() as u8)
    }

    fn set_volume(&mut self, value: u8) -> Result<(), String> {
        on_audio_thread(move |endpoint| unsafe {
            endpoint
                .SetMasterVolumeLevelScalar(value as f32 / 100.0, &windows::core::GUID::zeroed())
        })
    }

    fn mute(&mut self, muted: bool) -> Result<(), String> {
        on_audio_thread(move |endpoint| unsafe {
            endpoint.SetMute(muted, &windows::core::GUID::zeroed())
        })
    }

    fn media_key(&mut self, key: MediaKey) -> Result<(), String> {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
        };
        let vk = match key {
            MediaKey::PlayPause => 0xB3,
            MediaKey::Next => 0xB0,
            MediaKey::Previous => 0xB1,
        };
        let make = |flags| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let inputs = [make(Default::default()), make(KEYEVENTF_KEYUP)];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent == inputs.len() as u32 {
            Ok(())
        } else {
            Err("O Windows não aceitou o comando de mídia.".into())
        }
    }
}

#[cfg(windows)]
fn on_audio_thread<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(
            &windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume,
        ) -> windows::core::Result<T>
        + Send
        + 'static,
{
    std::thread::spawn(move || {
        use windows::{
            core::GUID,
            Win32::{
                Media::Audio::{
                    eMultimedia, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator,
                },
                System::Com::{
                    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL,
                    COINIT_MULTITHREADED,
                },
            },
        };
        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialized.0 < 0 {
            return Err("Não foi possível inicializar o controle de áudio do Windows.".to_string());
        }
        struct ComApartment;
        impl Drop for ComApartment {
            fn drop(&mut self) {
                unsafe { CoUninitialize() }
            }
        }
        let _apartment = ComApartment;
        let clsid = GUID::from_u128(0xBCDE0395_E52F_467C_8E3D_C4579291692E);
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&clsid, None, CLSCTX_ALL) }
            .map_err(|_| "Não foi possível localizar o serviço de áudio do Windows.".to_string())?;
        let endpoint = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) }
            .map_err(|_| "Não há dispositivo de saída de áudio disponível.".to_string())?;
        let control: IAudioEndpointVolume = unsafe { endpoint.Activate(CLSCTX_ALL, None) }
            .map_err(|_| {
                "Não foi possível acessar o volume do dispositivo de áudio.".to_string()
            })?;
        operation(&control)
            .map_err(|_| "O Windows não conseguiu aplicar a operação de áudio.".to_string())
    })
    .join()
    .map_err(|_| "O controle de áudio falhou.".to_string())?
}

#[cfg(not(windows))]
struct NativeAdapter;

#[cfg(not(windows))]
impl SystemAdapter for NativeAdapter {
    fn volume(&mut self) -> Result<u8, String> {
        Err("O controle de áudio só está disponível no Windows.".into())
    }
    fn set_volume(&mut self, _: u8) -> Result<(), String> {
        Err("O controle de áudio só está disponível no Windows.".into())
    }
    fn mute(&mut self, _: bool) -> Result<(), String> {
        Err("O controle de áudio só está disponível no Windows.".into())
    }
    fn media_key(&mut self, _: MediaKey) -> Result<(), String> {
        Err("Os controles de mídia só estão disponíveis no Windows.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn simulated_audio_respects_volume_bounds_and_has_no_native_effects() {
        let mut sim = SimulatedAdapter {
            volume: 33,
            ..Default::default()
        };
        assert_eq!(
            execute_with(&mut sim, "audio.set_volume", &json!({"volume":100})).unwrap(),
            "Volume definido para 100%"
        );
        assert_eq!(sim.volume, 100);
        assert!(execute_with(&mut sim, "audio.set_volume", &json!({"volume":101})).is_err());
        assert_eq!(sim.volume, 100);
        execute_with(&mut sim, "media.next", &json!({})).unwrap();
        assert_eq!(sim.media_commands, vec![MediaKey::Next]);
        assert!(!sim.muted);
    }

    #[test]
    fn registered_system_skills_use_closed_schemas_and_rust_risk() {
        for id in [
            "audio.get_volume",
            "audio.set_volume",
            "audio.mute",
            "media.play_pause",
            "media.next",
            "media.previous",
        ] {
            let skill = crate::security::skills::registry()
                .into_iter()
                .find(|skill| skill.id == id)
                .expect("skill must be registered");
            assert!(skill
                .risk(&match id {
                    "audio.set_volume" => json!({"volume": 40}),
                    "audio.mute" => json!({"muted": true}),
                    _ => json!({}),
                })
                .is_ok());
        }
        assert!(
            crate::system_actions::validate("audio.set_volume", &json!({"volume": 101})).is_err()
        );
        assert!(crate::system_actions::validate(
            "audio.set_volume",
            &json!({"volume": 20, "extra": true})
        )
        .is_err());
    }
}
