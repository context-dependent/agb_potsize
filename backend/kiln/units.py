MM_IN = 25.4
IN3_PER_L = 61.0237


def to_unit(unit: str, mm: float) -> float:
    return mm / MM_IN if unit == "in" else mm / 10


def from_unit(unit: str, v: float) -> float:
    return v * MM_IN if unit == "in" else v * 10


def step(unit: str) -> float:
    return 0.5 if unit == "in" else 1.0
