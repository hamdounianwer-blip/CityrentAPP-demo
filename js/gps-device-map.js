// ════════════════════════════════════════════════════════════════════
// gps-device-map.js — Correspondance PLAQUE (normalisée) → IMEI + date
// d'expiration, source = export MadarTech (DevicesOnlineLookupTable).
//
// Meme principe que plate-vehicle-map.js : un seul fichier a ouvrir pour
// mettre a jour la liste des boitiers GPS, sans toucher au reste du code
// ni a aucun id de vehicule/carte GPS.
//
// Cle = plaque normalisee (memes regles que _normPlate() dans
// module-gps-tracking.js : espaces/tirets retires, majuscules). Ca veut
// dire que "1234 T" (cote MadarTech) et "1234-T" (cote GPS Tracking)
// tombent sur la MEME cle "1234T" -> match automatique.
//
// Pour mettre a jour apres un nouvel export MadarTech : régénère cet
// objet (demande a Claude de relire le nouvel Excel), ou édite une ligne
// a la main au format "PLAQUENORMALISEE":{"imei":"...","expiry":"AAAA-MM-JJ"}.
//
// Genere le 2026-09-02 depuis DevicesOnlineLookupTable_20260902144641.xlsx
// (103 appareils). Doit être chargé AVANT js/module-gps-tracking.js (voir
// app.html, juste après plate-vehicle-map.js).
// ════════════════════════════════════════════════════════════════════

const GPS_DEVICE_MAP = {"1037TD":{"imei":"990000000000001","expiry":"2027-06-30"}, "1074T":{"imei":"990000000000002","expiry":"2027-06-30"}, "1111TA":{"imei":"990000000000003","expiry":"2027-06-30"}, "1148T":{"imei":"990000000000004","expiry":"2027-06-30"}, "1185TA":{"imei":"990000000000005","expiry":"2027-06-30"}, "1222TD":{"imei":"990000000000006","expiry":"2027-06-30"}, "1259TB":{"imei":"990000000000007","expiry":"2027-06-30"}, "1296TD":{"imei":"990000000000008","expiry":"2027-06-30"}, "1333TA":{"imei":"990000000000009","expiry":"2027-06-30"}, "1370TA":{"imei":"990000000000010","expiry":"2027-06-30"}, "1407T":{"imei":"990000000000011","expiry":"2027-06-30"}, "1444TA":{"imei":"990000000000012","expiry":"2027-06-30"}, "1481T":{"imei":"990000000000013","expiry":"2027-06-30"}, "1518TD":{"imei":"990000000000014","expiry":"2027-06-30"}, "1555TD":{"imei":"990000000000015","expiry":"2027-06-30"}, "1592T":{"imei":"990000000000016","expiry":"2027-06-30"}, "1629TA":{"imei":"990000000000017","expiry":"2027-06-30"}, "1666TB":{"imei":"990000000000018","expiry":"2027-06-30"}, "1703TA":{"imei":"990000000000019","expiry":"2027-06-30"}, "1740TA":{"imei":"990000000000020","expiry":"2027-06-30"}};

// ── getGpsDeviceInfo — lookup par plaque, meme normalisation que
// getGpsLink()/_normPlate(). Retourne null si aucun boitier MadarTech
// ne correspond a cette plaque. ──
function getGpsDeviceInfo(plate){
  if(!plate) return null;
  let key = _normPlate(plate);
  return GPS_DEVICE_MAP[key] || null;
}
