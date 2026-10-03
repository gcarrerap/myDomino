// Todo lo que toca el exterior: Firebase (auth y mesas en Firestore) y localStorage.
export { ls } from "./prefs.js";
export { loadFirebaseSdk, initFirebase, signInWithGoogle, signOut } from "./firebase.js";
export { SKIP, makeDb, watchTableList, watchTable, saveNewTable, updateTable } from "./tables-repo.js";
