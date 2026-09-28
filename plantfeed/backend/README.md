# PlantFeed backend

Small provider-separated API for the PlantFeed PWA.

## Endpoints
- `GET /health`
- `POST /identify` multipart field `image` (JPEG/PNG). Returns the top three Pl@ntNet candidates and confidence scores.
- `POST /recommend` JSON: `plant`, `condition`, `supplies`, optional `month`.

## Configuration
Set `PLANTNET_API_KEY` in the server environment. Never expose it in browser JavaScript or commit it to Git.

Run: `pip install -r requirements.txt && gunicorn -b 0.0.0.0:8080 app:app`

The recommendation layer is intentionally conservative. RHS guidance is the primary baseline for UK feeding behaviour; identification is provider-swappable and isolated behind the API.
