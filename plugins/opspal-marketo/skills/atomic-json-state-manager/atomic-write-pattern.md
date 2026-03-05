# Atomic Write Pattern

Write updated JSON to temp file, fsync if needed, and rename atomically to prevent partial state.
