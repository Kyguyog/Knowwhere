# Eaglercraft cloud saves

Eaglercraft worlds are copied from each client's IndexedDB save database (`worlds*` in older clients and the Eaglercraft `PlatformFilesystem` database in newer clients) to chunked documents under the signed-in user's Firestore record. The feature is on by default and can be disabled in **Settings → Account**.

The browser keeps local saves as the primary copy. Cloud activity is fully manual: **Save Cloud** and **Load Cloud** appear beside the fullscreen and close controls in the Eaglercraft popup. Loading reloads the game frame and restores the selected snapshot before the engine starts, allowing IndexedDB to be replaced safely. Nothing is uploaded on a timer, visibility change, page close, or ordinary game launch. Each Eaglercraft client directory has an independent snapshot so incompatible versions cannot overwrite one another. Snapshot chunks use generations, so an interrupted upload cannot replace the last complete manifest.
