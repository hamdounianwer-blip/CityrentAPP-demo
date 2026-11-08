// ════════════════════════════════════════════════════════════════════
// plate-vehicle-map.js — Table plaque → modèle
// ════════════════════════════════════════════════════════════════════
//
// Avant (jusqu'à 2026-08) : cette table vivait codée en dur au milieu de
// core.js. Ajouter un véhicule voulait dire éditer la logique principale
// de l'app. Elle est maintenant isolée ici : un seul fichier à ouvrir
// pour ajouter/corriger une plaque, sans risquer de toucher au reste.
//
// Pour ajouter un véhicule : ajoute une ligne "PLAQUE":"MODELE" ci-dessous
// (n'importe où dans l'objet, l'ordre n'a pas d'importance), puis
// sauvegarde et redémarre le serveur (ou recharge la page).
//
// Doit être chargé AVANT js/core.js (voir app.html).
// ════════════════════════════════════════════════════════════════════

const PLATE_VEHICLE_MAP = {"1037-TD":"YARIS", "1074-T":"COROLLA", "1111-TA":"ACCENT", "1148-T":"PICANTO", "1185-TA":"SUNNY", "1222-TD":"CITY", "1259-TB":"SPARK", "1296-TD":"ZS", "1333-TA":"ECOSPORT", "1370-TA":"TUCSON", "1407-T":"SPORTAGE", "1444-TA":"PATROL", "1481-T":"PRADO", "1518-TD":"PAJERO", "1555-TD":"X50", "1592-T":"YARIS", "1629-TA":"COROLLA", "1666-TB":"ACCENT", "1703-TA":"PICANTO", "1740-TA":"SUNNY", "1777-T":"CITY", "1814-TA":"SPARK", "1851-T":"ZS", "1888-TD":"ECOSPORT", "1925-TD":"TUCSON", "1962-T":"SPORTAGE", "1999-TB":"PATROL", "2036-TA":"PRADO", "2073-TA":"PAJERO", "2110-TA":"X50", "2147-TA":"YARIS", "2184-TA":"COROLLA"};
