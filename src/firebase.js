import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDl72XRGYDp7hZdy4KfTIw1J1Olh7xnyPI",
  authDomain: "loan-manager-616db.firebaseapp.com",
  projectId: "loan-manager-616db",
  storageBucket: "loan-manager-616db.firebasestorage.app",
  messagingSenderId: "154084055403",
  appId: "1:154084055403:web:a630c0bd190d4ef60ed42e"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()