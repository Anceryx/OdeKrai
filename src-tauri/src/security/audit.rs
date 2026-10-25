use super::*;

fn audit_files(logs: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for entry in
        fs::read_dir(logs).map_err(|_| "Não foi possível ler a pasta de auditoria.".to_string())?
    {
        let entry = entry.map_err(|_| "Não foi possível ler a pasta de auditoria.".to_string())?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "jsonl") {
            if has_reparse(&path) || !path.is_file() {
                return Err("A auditoria contém um caminho inesperado.".into());
            }
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn read_audit_lines(path: &Path) -> Result<Vec<AuditLine>, String> {
    let file =
        fs::File::open(path).map_err(|_| "Não foi possível verificar a auditoria.".to_string())?;
    let reader = BufReader::new(file);
    let mut lines = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|_| "Não foi possível ler a auditoria.".to_string())?;
        let parsed: AuditLine = serde_json::from_str(&line)
            .map_err(|_| "A cadeia de auditoria está inválida.".to_string())?;
        let serialized = serde_json::to_vec(&parsed.payload)
            .map_err(|_| "A cadeia de auditoria está inválida.".to_string())?;
        if parsed.hash != digest(&serialized) {
            return Err("A cadeia de auditoria foi alterada.".into());
        }
        lines.push(parsed);
    }
    Ok(lines)
}

pub(super) fn verify_audit_path(logs: &Path) -> Result<Vec<AuditLine>, String> {
    let mut previous = String::new();
    let mut all = Vec::new();
    for file in audit_files(logs)? {
        for line in read_audit_lines(&file)? {
            if line.payload.previous_hash != previous {
                return Err("A cadeia de auditoria está quebrada.".into());
            }
            previous = line.hash.clone();
            all.push(line);
        }
    }
    Ok(all)
}
