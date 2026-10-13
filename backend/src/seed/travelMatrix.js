/**
 * @file travelMatrix.js
 * @description Pre-computed travel distance and time matrix between seed locations in EmergencyLink.
 * Provides lookup matrices and fallback calculations for ETA and routing calculations.
 */

/**
 * Standard seed locations in the EmergencyLink regional grid
 */
const SEED_LOCATIONS = {
  // Hospitals
  CITY_GENERAL: {
    id: 'CITY_GENERAL',
    name: 'City General Hospital',
    lat: 37.7749,
    lng: -122.4194,
    address: '100 Metro Ave, Central District'
  },
  RIVERSIDE_MEDICAL: {
    id: 'RIVERSIDE_MEDICAL',
    name: 'Riverside Medical Center',
    lat: 37.795,
    lng: -122.402,
    address: '450 River Rd, Waterfront District'
  },
  NORTHGATE_CLINIC: {
    id: 'NORTHGATE_CLINIC',
    name: 'Northgate Clinic',
    lat: 37.805,
    lng: -122.425,
    address: '880 Northgate Blvd, North District'
  },
  ST_MARYS: {
    id: 'ST_MARYS',
    name: "St. Mary's Hospital",
    lat: 37.76,
    lng: -122.445,
    address: '300 Saint Mary St, West District'
  },
  EASTSIDE_TRAUMA: {
    id: 'EASTSIDE_TRAUMA',
    name: 'Eastside Trauma Center',
    lat: 37.765,
    lng: -122.39,
    address: '550 Eastside Pkwy, East District'
  },
  HARBOR_HOSPITAL: {
    id: 'HARBOR_HOSPITAL',
    name: 'Harbor Hospital',
    lat: 37.74,
    lng: -122.38,
    address: '12 Harbor View Dr, Port District'
  },

  // Incident & Pickup Points
  INCIDENT_DOWNTOWN: {
    id: 'INCIDENT_DOWNTOWN',
    name: 'Downtown Crossing (Incident 1 - Cardiac)',
    lat: 37.778,
    lng: -122.415,
    address: 'Market St & 5th St, Downtown'
  },
  INCIDENT_WESTSIDE: {
    id: 'INCIDENT_WESTSIDE',
    name: 'Westside Intersection (Incident 2 - Trauma)',
    lat: 37.763,
    lng: -122.438,
    address: 'Castro & Market St, Westside'
  },
  INCIDENT_WATERFRONT: {
    id: 'INCIDENT_WATERFRONT',
    name: 'North Waterfront Pier (Incident 3 - Respiratory)',
    lat: 37.8,
    lng: -122.41,
    address: 'Pier 39, Waterfront'
  },

  // Ambulance Depots
  AMBULANCE_BASE_CENTRAL: {
    id: 'AMBULANCE_BASE_CENTRAL',
    name: 'Central Ambulance Depot',
    lat: 37.776,
    lng: -122.417,
    address: 'Station 1, Central District'
  },
  AMBULANCE_BASE_NORTH: {
    id: 'AMBULANCE_BASE_NORTH',
    name: 'North River Depot',
    lat: 37.796,
    lng: -122.403,
    address: 'Station 2, Waterfront'
  },
  AMBULANCE_BASE_WEST: {
    id: 'AMBULANCE_BASE_WEST',
    name: 'Westside Station',
    lat: 37.761,
    lng: -122.443,
    address: 'Station 3, Westside'
  },
  AMBULANCE_BASE_SOUTH: {
    id: 'AMBULANCE_BASE_SOUTH',
    name: 'Port Maintenance Depot',
    lat: 37.741,
    lng: -122.381,
    address: 'Station 4, Port District'
  }
};

/**
 * Pre-computed distance (km) and travel duration (minutes) matrix
 * Average urban ambulance speed modeled at ~40 km/h with traffic factor
 */
const TRAVEL_MATRIX = {
  INCIDENT_DOWNTOWN: {
    CITY_GENERAL: { distanceKm: 1.2, durationMinutes: 4 },
    RIVERSIDE_MEDICAL: { distanceKm: 2.8, durationMinutes: 7 },
    NORTHGATE_CLINIC: { distanceKm: 4.1, durationMinutes: 11 },
    ST_MARYS: { distanceKm: 4.5, durationMinutes: 12 },
    EASTSIDE_TRAUMA: { distanceKm: 3.2, durationMinutes: 8 },
    HARBOR_HOSPITAL: { distanceKm: 6.8, durationMinutes: 17 }
  },
  INCIDENT_WESTSIDE: {
    CITY_GENERAL: { distanceKm: 3.6, durationMinutes: 9 },
    RIVERSIDE_MEDICAL: { distanceKm: 5.4, durationMinutes: 14 },
    NORTHGATE_CLINIC: { distanceKm: 6.1, durationMinutes: 16 },
    ST_MARYS: { distanceKm: 0.9, durationMinutes: 3 },
    EASTSIDE_TRAUMA: { distanceKm: 5.8, durationMinutes: 15 },
    HARBOR_HOSPITAL: { distanceKm: 7.2, durationMinutes: 18 }
  },
  INCIDENT_WATERFRONT: {
    CITY_GENERAL: { distanceKm: 3.9, durationMinutes: 10 },
    RIVERSIDE_MEDICAL: { distanceKm: 1.1, durationMinutes: 3 },
    NORTHGATE_CLINIC: { distanceKm: 1.8, durationMinutes: 5 },
    ST_MARYS: { distanceKm: 6.5, durationMinutes: 18 },
    EASTSIDE_TRAUMA: { distanceKm: 5.2, durationMinutes: 14 },
    HARBOR_HOSPITAL: { distanceKm: 8.9, durationMinutes: 22 }
  },
  CITY_GENERAL: {
    RIVERSIDE_MEDICAL: { distanceKm: 2.9, durationMinutes: 8 },
    NORTHGATE_CLINIC: { distanceKm: 3.8, durationMinutes: 10 },
    ST_MARYS: { distanceKm: 3.5, durationMinutes: 9 },
    EASTSIDE_TRAUMA: { distanceKm: 3.1, durationMinutes: 8 },
    HARBOR_HOSPITAL: { distanceKm: 5.8, durationMinutes: 15 }
  },
  RIVERSIDE_MEDICAL: {
    CITY_GENERAL: { distanceKm: 2.9, durationMinutes: 8 },
    NORTHGATE_CLINIC: { distanceKm: 2.3, durationMinutes: 6 },
    ST_MARYS: { distanceKm: 6.1, durationMinutes: 16 },
    EASTSIDE_TRAUMA: { distanceKm: 4.6, durationMinutes: 12 },
    HARBOR_HOSPITAL: { distanceKm: 7.9, durationMinutes: 20 }
  },
  NORTHGATE_CLINIC: {
    CITY_GENERAL: { distanceKm: 3.8, durationMinutes: 10 },
    RIVERSIDE_MEDICAL: { distanceKm: 2.3, durationMinutes: 6 },
    ST_MARYS: { distanceKm: 5.9, durationMinutes: 15 },
    EASTSIDE_TRAUMA: { distanceKm: 6.5, durationMinutes: 17 },
    HARBOR_HOSPITAL: { distanceKm: 9.8, durationMinutes: 25 }
  },
  ST_MARYS: {
    CITY_GENERAL: { distanceKm: 3.5, durationMinutes: 9 },
    RIVERSIDE_MEDICAL: { distanceKm: 6.1, durationMinutes: 16 },
    NORTHGATE_CLINIC: { distanceKm: 5.9, durationMinutes: 15 },
    EASTSIDE_TRAUMA: { distanceKm: 5.7, durationMinutes: 14 },
    HARBOR_HOSPITAL: { distanceKm: 6.9, durationMinutes: 17 }
  },
  EASTSIDE_TRAUMA: {
    CITY_GENERAL: { distanceKm: 3.1, durationMinutes: 8 },
    RIVERSIDE_MEDICAL: { distanceKm: 4.6, durationMinutes: 12 },
    NORTHGATE_CLINIC: { distanceKm: 6.5, durationMinutes: 17 },
    ST_MARYS: { distanceKm: 5.7, durationMinutes: 14 },
    HARBOR_HOSPITAL: { distanceKm: 3.9, durationMinutes: 10 }
  },
  HARBOR_HOSPITAL: {
    CITY_GENERAL: { distanceKm: 5.8, durationMinutes: 15 },
    RIVERSIDE_MEDICAL: { distanceKm: 7.9, durationMinutes: 20 },
    NORTHGATE_CLINIC: { distanceKm: 9.8, durationMinutes: 25 },
    ST_MARYS: { distanceKm: 6.9, durationMinutes: 17 },
    EASTSIDE_TRAUMA: { distanceKm: 3.9, durationMinutes: 10 }
  }
};

/**
 * Calculate Great-Circle distance using Haversine formula
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Get travel distance and estimated duration between two locations
 * Checks pre-computed matrix first; falls back to dynamic Haversine calculation.
 * @param {string|{lat: number, lng: number}} origin
 * @param {string|{lat: number, lng: number}} destination
 * @returns {{distanceKm: number, durationMinutes: number}}
 */
function getTravelEstimate(origin, destination) {
  const originKey = typeof origin === 'string' ? origin : null;
  const destKey = typeof destination === 'string' ? destination : null;

  // Check pre-computed matrix directly
  if (originKey && destKey) {
    if (TRAVEL_MATRIX[originKey] && TRAVEL_MATRIX[originKey][destKey]) {
      return TRAVEL_MATRIX[originKey][destKey];
    }
    if (TRAVEL_MATRIX[destKey] && TRAVEL_MATRIX[destKey][originKey]) {
      return TRAVEL_MATRIX[destKey][originKey];
    }
  }

  // Resolve coordinate objects
  const getCoords = (loc) => {
    if (typeof loc === 'string') {
      const found = SEED_LOCATIONS[loc];
      return found ? { lat: found.lat, lng: found.lng } : null;
    }
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  };

  const oCoords = getCoords(origin);
  const dCoords = getCoords(destination);

  if (!oCoords || !dCoords) {
    return { distanceKm: 5.0, durationMinutes: 12 }; // Default safe fallback
  }

  const distanceKm = haversineDistance(oCoords.lat, oCoords.lng, dCoords.lat, dCoords.lng);
  const avgSpeedKmH = 40; // Average emergency vehicle speed in city traffic
  const durationMinutes = Math.max(1, Math.round((distanceKm / avgSpeedKmH) * 60));

  return { distanceKm, durationMinutes };
}

module.exports = {
  SEED_LOCATIONS,
  TRAVEL_MATRIX,
  haversineDistance,
  getTravelEstimate
};
