import os
from pathlib import Path


def resolve_project_root() -> Path:
    env_root = os.environ.get("PROJECT_ROOT")
    if env_root:
        return Path(env_root).expanduser().resolve()

    path = Path(__file__).resolve()
    for parent in path.parents:
        if parent.name == "opspal-internal-plugins":
            return parent.parent

    for parent in path.parents:
        if parent.name == ".claude-plugins":
            return parent.parent

    return Path.cwd().resolve()


def _config_path_for(instances_dir: Path) -> Path:
    if instances_dir.name in ("salesforce", "hubspot"):
        return instances_dir.parent / "config.json"
    return instances_dir / "config.json"


def _instances_roots(project_root: Path):
    roots = []
    env_root = (
        os.environ.get("SFDC_INSTANCES_ROOT")
        or os.environ.get("SFDC_INSTANCES_DIR")
        or os.environ.get("INSTANCES_DIR")
    )
    if env_root:
        roots.append(Path(env_root).expanduser().resolve())

    sfdc_roots = [
        project_root / "opspal-internal" / "SFDC",
        project_root / "SFDC",
    ]
    for sfdc_root in sfdc_roots:
        instances_dir = sfdc_root / "instances"
        if instances_dir.exists():
            roots.append(instances_dir.resolve())

    return roots


def resolve_instance_root(project_root: Path) -> Path:
    env_instance = os.environ.get("INSTANCE_DIR")
    if env_instance:
        return Path(env_instance).expanduser().resolve()

    alias = (
        os.environ.get("SFDC_INSTANCE")
        or os.environ.get("SF_TARGET_ORG")
        or os.environ.get("SF_TARGET_ORG")
        or os.environ.get("SF_TARGET_ORG")
    )

    for instances_dir in _instances_roots(project_root):
        if not instances_dir.exists():
            continue

        config_path = _config_path_for(instances_dir)
        config_data = None
        if config_path.exists():
            try:
                import json
                with open(config_path, "r", encoding="utf-8") as handle:
                    config_data = json.load(handle)
            except Exception:
                config_data = None

        if not alias and config_data:
            alias = config_data.get("currentInstance")

        if alias and config_data:
            inst = config_data.get("instances", {}).get(alias)
            if inst:
                directory = inst.get("directory")
                if directory:
                    directory_path = Path(directory).expanduser()
                    if directory_path.exists():
                        return directory_path.resolve()

        if alias:
            instance_dir = instances_dir / alias
            if instance_dir.exists():
                return instance_dir.resolve()

    return project_root


def resolve_org_alias(project_root: Path, instance_root: Path | None = None) -> str | None:
    alias = (
        os.environ.get("SFDC_INSTANCE")
        or os.environ.get("SF_TARGET_ORG")
        or os.environ.get("SF_TARGET_ORG")
        or os.environ.get("SF_TARGET_ORG")
    )
    if alias:
        return alias

    for instances_dir in _instances_roots(project_root):
        if not instances_dir.exists():
            continue

        config_path = _config_path_for(instances_dir)
        config_data = None
        if config_path.exists():
            try:
                import json
                with open(config_path, "r", encoding="utf-8") as handle:
                    config_data = json.load(handle)
            except Exception:
                config_data = None

        if instance_root and config_data:
            for name, inst in config_data.get("instances", {}).items():
                directory = inst.get("directory")
                if directory:
                    directory_path = Path(directory).expanduser().resolve()
                    if directory_path == instance_root:
                        return name

        if instance_root and instance_root.parent == instances_dir:
            return instance_root.name

        if config_data:
            current = config_data.get("currentInstance")
            if current:
                return current

    return None


def require_org_alias(alias: str | None) -> str:
    if alias:
        return alias

    print("❌ No org alias resolved.")
    print("   Set INSTANCE_DIR or SFDC_INSTANCE/SF_TARGET_ORG.")
    raise SystemExit(1)


def require_sf_project(instance_root: Path) -> None:
    project_file = instance_root / "sfdx-project.json"
    if project_file.exists():
        return

    print("❌ Salesforce project not found at instance root.")
    print(f"   Expected: {project_file}")
    print("   Set INSTANCE_DIR or SFDC_INSTANCE/SF_TARGET_ORG to a valid instance.")
    raise SystemExit(1)
