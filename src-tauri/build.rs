fn main() {
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    if is_windows_msvc {
        let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-app.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        // O tauri-build embute o manifesto no aplicativo, mas não nos binários
        // do harness unitário. Usa o mesmo manifesto para todos os alvos MSVC.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());

        let attributes = tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attributes).expect("falha ao preparar a configuração do Tauri");
    } else {
        tauri_build::build();
    }
}
