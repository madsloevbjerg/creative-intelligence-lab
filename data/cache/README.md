Saved real model results for the Danish Coffee Lab demo.

Each file name is a hash of the request (model, prompt or phrase, image bytes, and parameters). The file stores the validated result and its list price. It does not store API keys or request headers.

A public visit never calls the API. If these files cover the whole demo, the page replays them at $0. If a piece is missing, the page uses mock labels and says so.

`npm run m2:smoke` writes the first real results here once `MODEL_API_KEY` is set. Commit those files so a new deploy can replay them.
