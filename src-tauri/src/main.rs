#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = odekrai_lib::run() {
        eprintln!("Falha ao iniciar o OdeKrai: {error}");
    }
}
