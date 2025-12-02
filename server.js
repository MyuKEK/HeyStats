// server.js - HeyStats API
const express = require('express');
const axios = require('axios');
// Wichtig: Lädt die Umgebungsvariablen aus der .env-Datei
require('dotenv').config(); 

const app = express();
const PORT = 3000;

// Variablen aus der .env-Datei lesen
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const STREAMER_USERNAME = process.env.STREAMER_USERNAME;

// Variablen zum Speichern und Verwalten des temporären Twitch Access Tokens
let accessToken = null; 
let tokenExpiration = 0; 

// Middleware, um CORS (Cross-Origin Resource Sharing) zu erlauben.
// Dies ist nötig, damit das Frontend (index.html) die API auf localhost aufrufen kann.
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); 
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.json());


// Funktion, um den OAuth Access Token von Twitch zu erhalten
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiration) {
    return accessToken; // Token ist noch gültig
  }
  
  try {
    console.log("Rufe neuen Twitch Access Token ab...");
    const response = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`
    );
    
    accessToken = response.data.access_token;
    // Setze die Ablaufzeit etwas vor dem tatsächlichen Ablauf der Twitch-Antwort
    tokenExpiration = Date.now() + (response.data.expires_in - 60) * 1000; 
    console.log("✅ Neuer Twitch Access Token erfolgreich abgerufen.");
    return accessToken;

  } catch (error) {
    console.error("❌ Fehler beim Abrufen des Twitch Tokens:", error.message);
    return null; 
  }
}

// Haupt-API-Endpunkt für alle Statistiken (Follower, Titel, Spiel)
app.get('/api/stats/all', async (req, res) => {
    const token = await getAccessToken();
    
    if (!token) {
        return res.status(500).json({ error: 'Interner Fehler: Konnte keinen Twitch Access Token erhalten.' });
    }

    try {
        // 1. Schritt: User-ID anhand des Streamer-Namens holen (Helix API benötigt IDs)
        const userResponse = await axios.get(
            `https://api.twitch.tv/helix/users?login=${STREAMER_USERNAME}`,
            {
                headers: {
                    'Client-ID': CLIENT_ID,
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const userData = userResponse.data.data[0];
        if (!userData) {
             return res.status(404).json({ error: `Streamer '${STREAMER_USERNAME}' nicht gefunden oder falscher Name in .env.` });
        }
        const userId = userData.id;

        // 2. Schritte: Follower-Zahl und Stream-Informationen (Titel, Spiel) parallel abfragen
        const followerPromise = axios.get(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`,
            { headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );

        const streamPromise = axios.get(
            `https://api.twitch.tv/helix/streams?user_login=${STREAMER_USERNAME}`,
            { headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );

        // Promise.all wartet auf beide Antworten gleichzeitig
        const [followerResponse, streamResponse] = await Promise.all([followerPromise, streamPromise]);
        
        const followerCount = followerResponse.data.total;
        const streamData = streamResponse.data.data[0]; 
        
        // Finales Datenformat
        const data = {
            streamer: STREAMER_USERNAME,
            followers: followerCount,
            is_live: !!streamData, 
            title: streamData ? streamData.title : 'Stream offline',
            game: streamData ? streamData.game_name : 'N/A',
            status: 'live_data_ok',
            last_updated: new Date().toISOString()
        };
        
        res.json(data);

    } catch (error) {
        console.error("Fehler beim Abruf der Twitch Helix API:", error.response?.data || error.message);
        res.status(500).json({ error: 'Fehler beim Abrufen der Daten von der Twitch API.', details: error.message });
    }
});

// Root-Endpunkt (Begrüßung)
app.get('/', (req, res) => {
  res.send('Willkommen bei der HeyStats API!');
});

// Server starten
app.listen(PORT, () => {
  console.log(`🚀 HeyStats Server läuft auf http://localhost:${PORT}`);
});