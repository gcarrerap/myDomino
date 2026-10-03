// Conexión con Firebase (SDK compat cargado desde el CDN en index.html, como global `firebase`).
// Es el único módulo que toca `firebase` directamente.

// Inicia Firebase y espera al primer usuario. Si no hay sesión, entra como invitado (anónimo).
// onUser(u, first) se llama cada vez que cambia el usuario; first es true solo la primera vez.
// Devuelve la instancia de Firestore. Truena si Firebase no está disponible o no hay configuración.
export async function initFirebase(onUser, config = window.FIREBASE_CONFIG) {
  if (!window.firebase || !config || !config.projectId) throw new Error("sin config");
  firebase.initializeApp(config);
  const auth = firebase.auth();
  try { await auth.getRedirectResult(); } catch {}
  await new Promise((res) => {
    let first = true;
    auth.onAuthStateChanged(async (u) => {
      if (!u) { try { await auth.signInAnonymously(); } catch (e) { console.warn(e); if (first) { first = false; res(); } } return; }
      const wasFirst = first;
      onUser(u, wasFirst);
      if (first) { first = false; res(); }
    });
  });
  return firebase.firestore();
}

// Entrar con Google: primero en ventana emergente; si el navegador la bloquea, con redirección.
// Truena con el error de Firebase (e.code) para que la interfaz decida qué mensaje mostrar.
export async function signInWithGoogle() {
  const prov = new firebase.auth.GoogleAuthProvider();
  prov.setCustomParameters({ prompt: "select_account" });
  try { await firebase.auth().signInWithPopup(prov); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await firebase.auth().signInWithRedirect(prov); return;
    }
    throw e;
  }
}

export async function signOut() { try { await firebase.auth().signOut(); } catch {} }
