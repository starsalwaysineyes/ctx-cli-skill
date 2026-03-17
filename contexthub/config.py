from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    admin_token: str | None


def load_settings() -> Settings:
    raw_data_dir = os.getenv("CONTEXT_HUB_DATA_DIR", "var/data")
    admin_token = os.getenv("CONTEXT_HUB_ADMIN_TOKEN") or None
    return Settings(
        data_dir=Path(raw_data_dir).expanduser().resolve(),
        admin_token=admin_token,
    )
