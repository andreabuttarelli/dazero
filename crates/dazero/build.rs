use std::path::PathBuf;
use std::process::Command;

fn main() {
    let ui_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("ui");

    println!("cargo:rerun-if-changed={}/src", ui_dir.display());
    println!("cargo:rerun-if-changed={}/index.html", ui_dir.display());
    println!("cargo:rerun-if-changed={}/package.json", ui_dir.display());

    // In release mode always build. In dev, skip if dist already exists.
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let dist = ui_dir.join("dist");
    let should_build = profile == "release" || !dist.exists();

    if should_build {
        let status = Command::new("bun")
            .arg("run")
            .arg("build")
            .current_dir(&ui_dir)
            .status()
            .expect("failed to invoke bun; is it installed?");
        if !status.success() {
            panic!("bun run build failed with status {status}");
        }
    } else {
        println!("cargo:warning=skipping UI build in dev (ui/dist already exists)");
    }
}
