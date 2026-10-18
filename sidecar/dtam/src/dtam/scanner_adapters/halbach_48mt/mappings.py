"""Channel naming conventions for the 48 mT Halbach deployment."""

# Logical DTAM channel id -> site-specific hardware labels.
TEMPERATURE_CHANNEL_MAP: dict[str, str] = {
    "temp_magnet_01": "pt100_magnet_a",
    "temp_magnet_02": "pt100_magnet_b",
    "temp_room_01": "pt100_room",
}

FREQUENCY_ACTUATOR_MAP: dict[str, str] = {
    "freq_comp_01": "center_frequency_controller",
}
