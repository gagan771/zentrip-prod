def get_emergency_information() -> str:
    """India emergency numbers. Deterministic — do not invent alternatives."""
    return (
        '{"emergency":"112","label":"India police, fire, and ambulance",'
        '"tourist_helpline":"1363","instruction":"If in danger, hang up and call 112 now."}'
    )
