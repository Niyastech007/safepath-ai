/**
 * SafePath AI - Interactive Leaflet Map Controller
 * Manages route rendering, POI layers, heatmaps, live walker animation,
 * multiple accurate basemaps (Google Maps, Satellite, Hybrid, Dark, Terrain),
 * and live GPS location beacon.
 */

const BASEMAP_TILES = {
    'google-streets': {
        name: 'Google Streets',
        url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        attribution: 'Map data © Google',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        filterClass: 'map-view-normal'
    },
    'google-hybrid': {
        name: 'Satellite Hybrid',
        url: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        attribution: 'Imagery © Google Satellite',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        filterClass: 'map-view-normal'
    },
    'google-sat': {
        name: 'Pure Satellite',
        url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        attribution: 'Imagery © Google Satellite',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        filterClass: 'map-view-normal'
    },
    'dark-night': {
        name: 'Night Safety Mode',
        url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        attribution: 'Map data © Google (Night Safety Mode)',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        filterClass: 'map-view-dark-night'
    },
    'google-terrain': {
        name: 'Terrain Topo',
        url: 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
        attribution: 'Map data © Google Terrain',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        filterClass: 'map-view-normal'
    }
};

class SafeMapController {
    constructor() {
        this.map = null;
        this.layers = {
            routes: L.layerGroup(),
            police: L.layerGroup(),
            safeHavens: L.layerGroup(),
            liquor: L.layerGroup(),
            hazards: L.layerGroup(),
            streetlights: L.layerGroup(),
            navigation: L.layerGroup(),
            userLocation: L.layerGroup(),
            debugGeometry: L.layerGroup()
        };
        
        this.currentRoutes = null;
        this.cityData = null;
        this.isDebugGeometryActive = false;
        this.activeRouteKey = 'safest'; // 'safest', 'balanced', 'fastest'
        this.currentBasemapKey = 'google-streets';
        this.baseTileLayer = null;
        this.startMarker = null;
        this.endMarker = null;
        this.walkerMarker = null;
        this.userGpsMarker = null;
        this.isSelectingLocation = null; // 'start', 'end', or 'hazard'

        // 🧭 Google Maps Live Navigation State
        this.googleNavMarker = null;
        this.googleNavInterval = null;
        this.googleNavCoords = null;
        this.googleNavStepIndex = 0;
        this.isGoogleNavActive = false;
        this.isCameraFollowLocked = true;
        this.navSpeedMultiplier = 1;
        this.isNavPaused = false;
        this.currentNavBearing = 0;
    }

    init(mapContainerId = 'map') {
        // Center on heart of Greater Tiruchirappalli (Trichy), Tamil Nadu
        this.map = L.map(mapContainerId, {
            zoomControl: false,
            attributionControl: false
        }).setView([10.8150, 78.6920], 14);

        // Add Zoom Control to bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Create custom Leaflet panes for strict visual hierarchy:
        // base map: z-index 200 (Leaflet tilePane default)
        // context/safety layers: z-index 300
        // streetlights: z-index 310
        // police/hospital/liquor markers: z-index 400
        // hazards: z-index 450
        // routes: z-index 600
        // start/destination markers: z-index 700

        this.map.createPane('contextPane');
        this.map.getPane('contextPane').style.zIndex = 300;

        this.map.createPane('streetlightsPane');
        this.map.getPane('streetlightsPane').style.zIndex = 310;

        this.map.createPane('poiPane');
        this.map.getPane('poiPane').style.zIndex = 400;

        this.map.createPane('hazardsPane');
        this.map.getPane('hazardsPane').style.zIndex = 450;

        this.map.createPane('routesPane');
        this.map.getPane('routesPane').style.zIndex = 600;

        this.map.createPane('markersPane');
        this.map.getPane('markersPane').style.zIndex = 700;

        // Initialize default clean navigation basemap (Default to Night Safety Mode to match Night Commute)
        this.setBasemap('dark-night');

        // Add standard layers to map (debugGeometry remains strictly OFF by default)
        const initialActiveLayers = [
            this.layers.streetlights,
            this.layers.police,
            this.layers.safeHavens,
            this.layers.liquor,
            this.layers.hazards,
            this.layers.routes,
            this.layers.navigation,
            this.layers.userLocation
        ];
        initialActiveLayers.forEach(layer => layer.addTo(this.map));

        // Click handler for selecting custom points or hazard pin
        this.map.on('click', (e) => this.handleMapClick(e));

        // Ensure map renders full dimensions immediately
        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 200);
    }

    setBasemap(viewKey) {
        if (!BASEMAP_TILES[viewKey]) return;
        this.currentBasemapKey = viewKey;
        const config = BASEMAP_TILES[viewKey];
        this._tileFallbackTriggered = false;

        // Remove previous basemap layer
        if (this.baseTileLayer && this.map.hasLayer(this.baseTileLayer)) {
            this.map.removeLayer(this.baseTileLayer);
        }

        // Add new tile layer with full resolution
        this.baseTileLayer = L.tileLayer(config.url, {
            maxZoom: config.maxZoom || 20,
            subdomains: config.subdomains || 'abc',
            attribution: config.attribution
        }).addTo(this.map);

        // Fail-safe tile fallback: if browser or client network blocks specific tiles, seamlessly fallback to OSM
        this.baseTileLayer.on('tileerror', () => {
            if (!this._tileFallbackTriggered) {
                this._tileFallbackTriggered = true;
                L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap'
                }).addTo(this.map);
            }
        });

        // Ensure basemap sits strictly behind all routes and markers
        if (this.baseTileLayer.bringToBack) {
            this.baseTileLayer.bringToBack();
        }

        // Manage CSS class on map element for night / evening / normal mode
        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.classList.remove('map-view-dark-night', 'map-view-evening', 'map-view-normal');
            mapEl.classList.add(config.filterClass || 'map-view-normal');
        }

        // Sync active class on view buttons
        document.querySelectorAll('.map-view-btn').forEach(btn => {
            if (btn.dataset.view === viewKey) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    setTileTheme(theme = 'night') {
        const mapEl = document.getElementById('map');
        if (!mapEl) return;

        // Commute context dynamically shifts the visual basemap and streetlights
        if (theme === 'night') {
            this.setBasemap('dark-night');
            this.setStreetlightIntensity(1.0); // full intensity streetlight halo
        } else if (theme === 'evening') {
            this.setBasemap('google-streets');
            this.setStreetlightIntensity(0.70); // twilight illumination
            if (mapEl) {
                mapEl.classList.remove('map-view-dark-night', 'map-view-normal');
                mapEl.classList.add('map-view-evening');
            }
        } else if (theme === 'day') {
            this.setBasemap('google-streets');
            this.setStreetlightIntensity(0.12); // dimmed daylight streetlights
            if (mapEl) {
                mapEl.classList.remove('map-view-dark-night', 'map-view-evening');
                mapEl.classList.add('map-view-normal');
            }
        }

        if (this.map) this.map.invalidateSize();
    }

    setStreetlightIntensity(level = 1.0) {
        this.currentLightLevel = level;
        if (!this.layers || !this.layers.streetlights) return;
        this.layers.streetlights.eachLayer(layer => {
            if (layer.setStyle && layer.baseOpacity !== undefined) {
                const targetOpacity = Math.max(0.10, Math.min(0.38, layer.baseOpacity * level));
                layer.setStyle({
                    opacity: targetOpacity
                });
            }
        });
    }

    updateUserLocationMarker(lat, lng, accuracy, onSelectStart) {
        this.userGpsCoord = [lat, lng];
        this.layers.userLocation.clearLayers();

        const gpsIcon = L.divIcon({
            className: 'user-gps-marker',
            html: `
                <div class="gps-beacon-container">
                    <div class="gps-beacon-pulse"></div>
                    <div class="gps-beacon-core"></div>
                </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

        this.userGpsMarker = L.marker([lat, lng], { 
            icon: gpsIcon, 
            zIndexOffset: 6000 
        });
        
        const popupContent = `
            <div style="font-family: inherit; font-size: 11.5px; color: #1e293b; min-width: 175px;">
                <div style="font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 14px;">📍</span> Live GPS Location
                </div>
                <div style="font-size: 10.5px; color: #64748b; margin-top: 3px;">
                    ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E
                </div>
                <div style="font-size: 10px; color: #10b981; font-weight: 700; margin-top: 2px;">
                    ● Accuracy: ±${Math.round(accuracy || 10)}m
                </div>
                <button id="btnSetGpsAsStart" style="margin-top: 8px; width: 100%; padding: 6px 10px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: 800; font-size: 10.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <span>🚀</span> Set as Route Origin (A)
                </button>
            </div>
        `;

        this.userGpsMarker.bindPopup(popupContent);
        this.layers.userLocation.addLayer(this.userGpsMarker);

        // Accuracy radius circle
        if (accuracy && accuracy < 600) {
            const accCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: '#38bdf8',
                fillColor: '#38bdf8',
                fillOpacity: 0.12,
                weight: 1
            });
            this.layers.userLocation.addLayer(accCircle);
        }

        this.userGpsMarker.on('popupopen', () => {
            const btn = document.getElementById('btnSetGpsAsStart');
            if (btn && onSelectStart) {
                btn.addEventListener('click', () => {
                    this.userGpsMarker.closePopup();
                    onSelectStart(lat, lng);
                });
            }
        });

        return this.userGpsMarker;
    }

    centerOnLocation(lat, lng, zoom = 15) {
        if (!this.map) return;
        this.map.flyTo([lat, lng], zoom, { animate: true, duration: 1.2 });
    }

    calculateHaversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const toRad = Math.PI / 180;
        const dLat = (lat2 - lat1) * toRad;
        const dLon = (lon2 - lon1) * toRad;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    getUserDistance(lat, lng) {
        let uLat = null, uLng = null;
        if (this.userGpsMarker) {
            const ll = this.userGpsMarker.getLatLng();
            uLat = ll.lat; uLng = ll.lng;
        } else if (window.appController && window.appController.currentWalkerCoord) {
            uLat = window.appController.currentWalkerCoord[0];
            uLng = window.appController.currentWalkerCoord[1];
        } else if (this.startMarker) {
            const ll = this.startMarker.getLatLng();
            uLat = ll.lat; uLng = ll.lng;
        }
        if (uLat !== null && uLng !== null) {
            return Math.round(this.calculateHaversine(lat, lng, uLat, uLng));
        }
        return null;
    }

    getDistanceToActiveRoute(lat, lng) {
        if (!this.currentRoutes || !this.currentRoutes[this.activeRouteKey]) return null;
        const coords = this.currentRoutes[this.activeRouteKey].coordinates;
        if (!coords || coords.length === 0) return null;
        let minM = Infinity;
        for (let i = 0; i < coords.length; i++) {
            const d = this.calculateHaversine(lat, lng, coords[i][0], coords[i][1]);
            if (d < minM) minM = d;
        }
        return Math.round(minM);
    }

    toggleLayer(layerKey, isVisible) {
        if (layerKey === 'debugGeometry') {
            this.toggleDebugGeometry(isVisible);
            return;
        }
        const layer = this.layers[layerKey];
        if (!layer || !this.map) return;
        if (isVisible) {
            if (!this.map.hasLayer(layer)) {
                this.map.addLayer(layer);
            }
        } else {
            if (this.map.hasLayer(layer)) {
                this.map.removeLayer(layer);
            }
        }
    }

    highlightAndFocusPOI(lat, lng, poiId) {
        if (!this.map) return;
        this.centerOnLocation(lat, lng, 16);
        const allGroups = [this.layers.police, this.layers.safeHavens, this.layers.liquor];
        for (const grp of allGroups) {
            grp.eachLayer(layer => {
                if (layer.poiData && (layer.poiData.id === poiId || 
                    (Math.abs(layer.getLatLng().lat - lat) < 0.0002 && Math.abs(layer.getLatLng().lng - lng) < 0.0002))) {
                    layer.openPopup();
                }
            });
        }
    }

    loadCityLayers(cityData) {
        this.cityData = cityData;
        // 1. Police Stations (amenity=police)
        this.layers.police.clearLayers();
        if (cityData.police_stations) {
            cityData.police_stations.forEach(p => {
                const policeIcon = L.divIcon({
                    className: 'custom-poi-police',
                    html: `
                        <div class="bg-blue-600 text-white p-1.5 rounded-full shadow-lg border-2 border-white flex items-center justify-center w-8 h-8 hover:scale-110 transition-transform">
                            <span style="font-size: 14px;">👮</span>
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });

                const marker = L.marker([p.lat, p.lng], { icon: policeIcon, pane: 'poiPane' });
                marker.poiData = p;

                const buildPopupContent = () => {
                    const uDist = this.getUserDistance(p.lat, p.lng);
                    const rDist = this.getDistanceToActiveRoute(p.lat, p.lng);
                    const userDistStr = uDist !== null ? (uDist >= 1000 ? `${(uDist/1000).toFixed(1)} km` : `${uDist} m`) : 'Calculating...';
                    const routeDistStr = rDist !== null ? (rDist >= 1000 ? `${(rDist/1000).toFixed(1)} km` : `${rDist} m`) : 'Route active';

                    return `
                        <div class="p-2.5" style="min-width: 240px; font-family: inherit;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span class="text-xs font-bold text-blue-400 uppercase tracking-wider">👮 Police & Emergency</span>
                                <span class="badge-micro badge-verified">24/7 Verified</span>
                            </div>
                            <div class="font-bold text-sm text-white">${p.name}</div>
                            <div class="text-xs text-gray-300 mt-1">📞 Helpline: <strong class="text-emerald-400">${p.phone}</strong></div>
                            
                            <div style="background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; padding: 6px 8px; margin-top: 8px; font-size: 11px;">
                                <div style="color: #93c5fd; font-weight: 700;">📍 Proximity Telemetry:</div>
                                <div style="color: #e2e8f0; margin-top: 2px;">• Distance from you: <strong>${userDistStr}</strong></div>
                                <div style="color: #e2e8f0;">• Route proximity: <strong>${routeDistStr}</strong></div>
                            </div>

                            <div class="text-xs text-emerald-400 mt-2 font-semibold">● 24/7 Rapid Response & Security Patrols</div>
                            <div style="margin-top: 4px; font-size: 9px; color: #64748b;">
                                Source: ${p.source || 'OpenStreetMap (amenity=police) / TN Police'} | Updated: ${p.last_updated || '2025-01-15'}
                            </div>
                        </div>
                    `;
                };

                marker.bindPopup(buildPopupContent());
                marker.on('popupopen', () => marker.setPopupContent(buildPopupContent()));
                this.layers.police.addLayer(marker);

                // Add subtle protective 300m safety radius circle on contextPane
                const circle = L.circle([p.lat, p.lng], {
                    pane: 'contextPane',
                    radius: 300,
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.05,
                    weight: 1,
                    dashArray: '4, 4'
                });
                this.layers.police.addLayer(circle);
            });
        }

        // 2. Safe Havens & Hospitals (amenity=hospital)
        this.layers.safeHavens.clearLayers();
        if (cityData.safe_havens) {
            cityData.safe_havens.forEach(sh => {
                const havenIcon = L.divIcon({
                    className: 'custom-poi-haven',
                    html: `
                        <div class="bg-emerald-600 text-white p-1.5 rounded-full shadow-lg border-2 border-white flex items-center justify-center w-8 h-8 hover:scale-110 transition-transform">
                            <span style="font-size: 14px;">🏥</span>
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });

                const marker = L.marker([sh.lat, sh.lng], { icon: havenIcon, pane: 'poiPane' });
                marker.poiData = sh;

                const buildPopupContent = () => {
                    const uDist = this.getUserDistance(sh.lat, sh.lng);
                    const rDist = this.getDistanceToActiveRoute(sh.lat, sh.lng);
                    const userDistStr = uDist !== null ? (uDist >= 1000 ? `${(uDist/1000).toFixed(1)} km` : `${uDist} m`) : 'Calculating...';
                    const routeDistStr = rDist !== null ? (rDist >= 1000 ? `${(rDist/1000).toFixed(1)} km` : `${rDist} m`) : 'Route active';

                    return `
                        <div class="p-2.5" style="min-width: 240px; font-family: inherit;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">🏥 Hospital / Safe Haven</span>
                                <span class="badge-micro badge-verified">24/7 Haven</span>
                            </div>
                            <div class="font-bold text-sm text-white">${sh.name}</div>
                            <div class="text-xs text-gray-300 mt-1">📞 Emergency: <strong class="text-emerald-400">${sh.phone || '108'}</strong></div>

                            <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 6px 8px; margin-top: 8px; font-size: 11px;">
                                <div style="color: #6ee7b7; font-weight: 700;">📍 Proximity Telemetry:</div>
                                <div style="color: #e2e8f0; margin-top: 2px;">• Distance from you: <strong>${userDistStr}</strong></div>
                                <div style="color: #e2e8f0;">• Route proximity: <strong>${routeDistStr}</strong></div>
                            </div>

                            <div class="text-xs text-emerald-300 mt-2">${sh.emergency_designation || 'Guarded entrance with CCTV & emergency support.'}</div>
                            <div style="margin-top: 4px; font-size: 9px; color: #64748b;">
                                Source: ${sh.source || 'OpenStreetMap (amenity=hospital) / DMRHS'} | Updated: ${sh.last_updated || '2025-01-15'}
                            </div>
                        </div>
                    `;
                };

                marker.bindPopup(buildPopupContent());
                marker.on('popupopen', () => marker.setPopupContent(buildPopupContent()));
                this.layers.safeHavens.addLayer(marker);
            });
        }

        // 3. Licensed Liquor Retail Outlets / TASMAC (shop=alcohol)
        // Represented strictly as a contextual environmental factor for situational awareness.
        this.layers.liquor.clearLayers();
        if (cityData.liquor_outlets) {
            cityData.liquor_outlets.forEach(lo => {
                const liquorIcon = L.divIcon({
                    className: 'custom-poi-liquor',
                    html: `
                        <div class="bg-amber-600 text-white p-1 rounded-full shadow-lg border-2 border-white flex items-center justify-center w-7 h-7 hover:scale-110 transition-transform">
                            <span style="font-size: 13px;">🍺</span>
                        </div>
                    `,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });

                const marker = L.marker([lo.lat, lo.lng], { icon: liquorIcon, pane: 'poiPane' });
                marker.poiData = lo;

                const buildPopupContent = () => {
                    const uDist = this.getUserDistance(lo.lat, lo.lng);
                    const rDist = this.getDistanceToActiveRoute(lo.lat, lo.lng);
                    const userDistStr = uDist !== null ? (uDist >= 1000 ? `${(uDist/1000).toFixed(1)} km` : `${uDist} m`) : 'Calculating...';
                    const routeDistStr = rDist !== null ? (rDist >= 1000 ? `${(rDist/1000).toFixed(1)} km` : `${rDist} m`) : 'Route active';

                    return `
                        <div class="p-2.5" style="min-width: 240px; font-family: inherit;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span class="text-xs font-bold text-amber-400 uppercase tracking-wider">🍺 Liquor Retail / TASMAC</span>
                                <span class="badge-micro badge-conf">${lo.license_status || 'Licensed Retail'}</span>
                            </div>
                            <div class="font-bold text-sm text-white">${lo.name}</div>
                            <div class="text-xs text-gray-300 mt-1">🕒 Operating Hours: <strong>${lo.operating_hours || '12:00 PM - 10:00 PM'}</strong></div>

                            <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px; padding: 6px 8px; margin-top: 8px; font-size: 11px;">
                                <div style="color: #fbbf24; font-weight: 700;">📍 Proximity Telemetry:</div>
                                <div style="color: #e2e8f0; margin-top: 2px;">• Distance from you: <strong>${userDistStr}</strong></div>
                                <div style="color: #e2e8f0;">• Route proximity: <strong>${routeDistStr}</strong></div>
                            </div>

                            <div style="margin-top: 8px; font-size: 10px; color: #94a3b8; font-style: italic; line-height: 1.35; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px;">
                                ℹ️ Nearby environmental factors are shown for situational awareness.
                            </div>
                            <div style="margin-top: 4px; font-size: 9px; color: #64748b;">
                                Source: ${lo.source || 'OpenStreetMap (shop=alcohol) / State Retail Directory'} | Updated: ${lo.last_updated || '2025-01-15'}
                            </div>
                        </div>
                    `;
                };

                marker.bindPopup(buildPopupContent());
                marker.on('popupopen', () => marker.setPopupContent(buildPopupContent()));
                this.layers.liquor.addLayer(marker);
            });
        }

        // 4. Hazards & Crowdsourced Reports
        this.renderHazardReports(cityData.hazard_reports);

        // 5. Streetlights (Subtle, clean translucent road coverage overlays)
        this.layers.streetlights.clearLayers();
        if (cityData.edges) {
            cityData.edges.forEach(edge => {
                const lighting = edge.lighting !== undefined ? edge.lighting : 0.5;
                // Only show streetlight coverage overlay for lit corridors (lighting >= 0.25)
                if (lighting >= 0.25 && edge.geometry && edge.geometry.length >= 2) {
                    const baseOpacity = Math.max(0.18, Math.min(0.35, lighting * 0.38));
                    const currentLevel = this.currentLightLevel !== undefined ? this.currentLightLevel : 1.0;
                    const streetLine = L.polyline(edge.geometry, {
                        pane: 'streetlightsPane',
                        color: '#eab308', // Warm subtle amber (NOT giant glowing yellow)
                        weight: 3,
                        opacity: Math.max(0.10, Math.min(0.38, baseOpacity * currentLevel)),
                        lineCap: 'round',
                        lineJoin: 'round',
                        smoothFactor: 0.1
                    });
                    streetLine.baseOpacity = baseOpacity;
                    streetLine.bindTooltip(`
                        <div style="font-family: inherit; font-size: 11px;">
                            💡 <b>${edge.street}</b><br/>
                            Streetlight Coverage: <b>${Math.round(lighting * 100)}%</b>
                        </div>
                    `, { sticky: true });
                    this.layers.streetlights.addLayer(streetLine);
                }
            });
        }
    }

    renderHazardReports(reports) {
        this.layers.hazards.clearLayers();
        reports.forEach(h => {
            const isBrokenLight = h.type === 'broken_light';
            const bgColor = isBrokenLight ? 'bg-amber-500' : 'bg-rose-600';
            
            const hazardIcon = L.divIcon({
                className: 'custom-hazard-pin',
                html: `
                    <div class="${bgColor} text-white p-1.5 rounded-full shadow-lg border-2 border-white flex items-center justify-center w-7 h-7 animate-bounce">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                `,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([h.lat, h.lng], { icon: hazardIcon, pane: 'hazardsPane' })
                .bindPopup(`
                    <div class="p-2" style="font-family: inherit;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span class="text-xs font-bold text-rose-400 uppercase tracking-wider">⚠️ Monitored Hazard</span>
                            <span class="badge-micro ${h.status === 'verified' ? 'badge-verified' : 'badge-estimated'}">${h.status}</span>
                        </div>
                        <div class="font-bold text-sm text-white">${h.category}</div>
                        <div class="text-xs text-gray-300 mt-1">${h.description}</div>
                        <div class="text-xs text-gray-400 mt-2 pt-1 border-t border-gray-700 flex justify-between">
                            <span>Confidence: <strong class="text-emerald-400">${Math.round((h.confidence || 0.65) * 100)}%</strong></span>
                            <span>👍 ${h.upvotes || 1} Reports</span>
                        </div>
                    </div>
                `);
            this.layers.hazards.addLayer(marker);
        });
    }

    renderRoutes(routesData, selectedKey = 'safest') {
        this.currentRoutes = routesData;
        this.activeRouteKey = selectedKey;
        this.layers.routes.clearLayers();

        // Stacking order: inactive routes drawn first, and the selected active route ALWAYS drawn LAST on top!
        const allKeys = ['fastest', 'balanced', 'safest'];
        const drawOrder = allKeys.filter(k => k !== selectedKey).concat([selectedKey]);

        const activeRoute = routesData[selectedKey];

        drawOrder.forEach(key => {
            const route = routesData[key];
            if (!route || !route.coordinates || route.coordinates.length < 2) return;

            const isSelected = (key === selectedKey);

            // Avoid ghosting/bleeding: if an unselected route follows the exact same path
            // as the selected route, skip drawing it underneath so its color doesn't leak or look misaligned!
            if (!isSelected && activeRoute) {
                const sameNodes = activeRoute.node_ids && route.node_ids && 
                    JSON.stringify(activeRoute.node_ids) === JSON.stringify(route.node_ids);
                const sameCoords = Math.abs(route.distance_m - activeRoute.distance_m) < 15 &&
                    Math.abs(route.coordinates.length - activeRoute.coordinates.length) < 3;
                if (sameNodes || sameCoords) {
                    return; // Covered cleanly by active route
                }
            }

            // Draw main polyline on routesPane (z-index 600)
            const polyline = L.polyline(route.coordinates, {
                pane: 'routesPane',
                color: route.color,
                weight: isSelected ? 6.5 : 4.0,
                opacity: isSelected ? 0.95 : 0.60,
                dashArray: key === 'fastest' ? '7, 7' : null,
                lineCap: 'round',
                lineJoin: 'round',
                smoothFactor: 0.1
            });

            polyline.on('click', () => {
                if (window.appController) {
                    window.appController.selectRoute(key);
                }
            });

            polyline.bindTooltip(`
                <b>${route.title}</b><br/>
                🛡️ Safety: ${route.safety_score}% | ⏱️ ${route.duration_mins} mins
            `, { sticky: true, className: 'route-tooltip' });

            this.layers.routes.addLayer(polyline);
        });

        // Update Start & End markers
        if (activeRoute && activeRoute.coordinates.length > 0) {
            const startCoord = activeRoute.coordinates[0];
            const endCoord = activeRoute.coordinates[activeRoute.coordinates.length - 1];

            this.updateStartEndMarkers(startCoord, endCoord);

            // Auto-fit bounds
            const bounds = L.latLngBounds(activeRoute.coordinates);
            this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });

            // Refresh debug geometry if active
            if (this.isDebugGeometryActive) {
                this.toggleDebugGeometry(true);
            }
        }
    }

    updateStartEndMarkers(startCoord, endCoord, startLabel = null, endLabel = null) {
        if (this.startMarker) this.map.removeLayer(this.startMarker);
        if (this.endMarker) this.map.removeLayer(this.endMarker);

        const isUserLocationStart = (this.userGpsCoord && 
            Math.abs(startCoord[0] - this.userGpsCoord[0]) < 0.0001 && 
            Math.abs(startCoord[1] - this.userGpsCoord[1]) < 0.0001);

        // Google Maps-style teardrop START pin (green / sky-blue for GPS)
        const startIcon = L.divIcon({
            className: 'safepath-map-pin-wrapper',
            html: `
                <div class="safepath-pin safepath-pin-start ${isUserLocationStart ? 'safepath-pin-gps' : ''}">
                    ${isUserLocationStart ? `<div class="safepath-pin-gps-ring"></div>` : ''}
                    <svg class="safepath-pin-svg" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <filter id="pin-shadow-a" x="-40%" y="-20%" width="180%" height="160%">
                                <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
                            </filter>
                        </defs>
                        <path d="M20 2 C10.06 2 2 10.06 2 20 C2 32.5 20 50 20 50 C20 50 38 32.5 38 20 C38 10.06 29.94 2 20 2 Z"
                              fill="${isUserLocationStart ? '#0ea5e9' : '#16a34a'}"
                              stroke="#ffffff" stroke-width="2.5" filter="url(#pin-shadow-a)"/>
                        <text x="20" y="24" text-anchor="middle" dominant-baseline="middle"
                              font-family="system-ui, -apple-system, sans-serif" font-size="14"
                              font-weight="900" fill="#ffffff" letter-spacing="0">
                            ${isUserLocationStart ? '●' : 'A'}
                        </text>
                    </svg>
                    <div class="safepath-pin-label">${startLabel || (isUserLocationStart ? 'My Location' : 'Origin')}</div>
                </div>
            `,
            iconSize: [40, 56],
            iconAnchor: [20, 52],
            popupAnchor: [0, -54]
        });

        // Google Maps-style teardrop DESTINATION pin (red)
        const endIcon = L.divIcon({
            className: 'safepath-map-pin-wrapper',
            html: `
                <div class="safepath-pin safepath-pin-end">
                    <svg class="safepath-pin-svg" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <filter id="pin-shadow-b" x="-40%" y="-20%" width="180%" height="160%">
                                <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
                            </filter>
                        </defs>
                        <path d="M20 2 C10.06 2 2 10.06 2 20 C2 32.5 20 50 20 50 C20 50 38 32.5 38 20 C38 10.06 29.94 2 20 2 Z"
                              fill="#dc2626"
                              stroke="#ffffff" stroke-width="2.5" filter="url(#pin-shadow-b)"/>
                        <text x="20" y="24" text-anchor="middle" dominant-baseline="middle"
                              font-family="system-ui, -apple-system, sans-serif" font-size="14"
                              font-weight="900" fill="#ffffff" letter-spacing="0">B</text>
                    </svg>
                    <div class="safepath-pin-label">${endLabel || 'Destination'}</div>
                </div>
            `,
            iconSize: [40, 56],
            iconAnchor: [20, 52],
            popupAnchor: [0, -54]
        });

        this.startMarker = L.marker(startCoord, { icon: startIcon, pane: 'markersPane', zIndexOffset: 7000 }).addTo(this.map);
        this.startMarker.bindTooltip(
            `<div style="font-size:12px;font-weight:700;">${isUserLocationStart ? '📍 My Live Location (Start)' : '🟢 Start (A)'}</div>
             <div style="font-size:10.5px;color:#64748b;">${startCoord[0].toFixed(5)}°N, ${startCoord[1].toFixed(5)}°E</div>`,
            { sticky: true, className: 'safepath-pin-tooltip' }
        );

        this.endMarker = L.marker(endCoord, { icon: endIcon, pane: 'markersPane', zIndexOffset: 7000 }).addTo(this.map);
        this.endMarker.bindTooltip(
            `<div style="font-size:12px;font-weight:700;">🔴 Destination (B)</div>
             <div style="font-size:10.5px;color:#64748b;">${endCoord[0].toFixed(5)}°N, ${endCoord[1].toFixed(5)}°E</div>`,
            { sticky: true, className: 'safepath-pin-tooltip' }
        );
    }

    toggleDebugGeometry(show) {
        this.isDebugGeometryActive = !!show;
        if (!this.layers.debugGeometry || !this.map) return;
        this.layers.debugGeometry.clearLayers();

        if (!show) {
            if (this.map.hasLayer(this.layers.debugGeometry)) {
                this.map.removeLayer(this.layers.debugGeometry);
            }
            return;
        }

        if (!this.map.hasLayer(this.layers.debugGeometry)) {
            this.layers.debugGeometry.addTo(this.map);
        }

        // 1. Render all graph decision nodes with coordinates & IDs
        if (this.cityData && this.cityData.nodes) {
            this.cityData.nodes.forEach(node => {
                const nodeMarker = L.circleMarker([node.lat, node.lng], {
                    pane: 'contextPane',
                    radius: 4,
                    color: '#7c3aed',
                    fillColor: '#c4b5fd',
                    fillOpacity: 0.6,
                    weight: 1.5
                });
                nodeMarker.bindTooltip(`
                    <div style="font-family: inherit; font-size: 11px;">
                        <strong style="color: #7c3aed;">● Graph Decision Node</strong><br/>
                        <b>${node.name}</b><br/>
                        <code>ID: ${node.id}</code><br/>
                        <span style="color: #64748b;">${node.lat.toFixed(5)}°N, ${node.lng.toFixed(5)}°E</span>
                    </div>
                `, { sticky: true });
                this.layers.debugGeometry.addLayer(nodeMarker);
            });
        }

        // 2. Render all road edges with intermediate geometry (thin subtle dashed lines)
        if (this.cityData && this.cityData.edges) {
            this.cityData.edges.forEach(edge => {
                const geom = edge.geometry;
                if (geom && geom.length >= 2) {
                    const edgeLine = L.polyline(geom, {
                        pane: 'contextPane',
                        color: '#a855f7',
                        weight: 1.5,
                        dashArray: '4, 4',
                        opacity: 0.35,
                        lineCap: 'round',
                        lineJoin: 'round'
                    });
                    edgeLine.bindTooltip(`
                        <div style="font-family: inherit; font-size: 11px;">
                            <strong style="color: #9333ea;">🛣️ Road Segment: ${edge.street}</strong><br/>
                            <code>${edge.u} ↔ ${edge.v}</code> | ${Math.round(edge.length_m)}m<br/>
                            💡 Light: ${Math.round(edge.lighting * 100)}% | 👥 Crowd: ${Math.round(edge.crowd * 100)}%
                        </div>
                    `, { sticky: true });
                    this.layers.debugGeometry.addLayer(edgeLine);
                }
            });
        }

        // 3. Render vertices of the active route polyline
        if (this.currentRoutes && this.currentRoutes[this.activeRouteKey]) {
            const activeRoute = this.currentRoutes[this.activeRouteKey];
            if (activeRoute.coordinates) {
                activeRoute.coordinates.forEach((coord, idx) => {
                    const vertMarker = L.circleMarker(coord, {
                        pane: 'routesPane',
                        radius: 2.5,
                        color: '#0284c7',
                        fillColor: '#7dd3fc',
                        fillOpacity: 0.8,
                        weight: 1
                    });
                    vertMarker.bindTooltip(`
                        <div style="font-family: inherit; font-size: 10.5px;">
                            <strong style="color: #0284c7;">📍 Route Vertex #${idx}</strong><br/>
                            ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}
                        </div>
                    `, { sticky: true });
                    this.layers.debugGeometry.addLayer(vertMarker);
                });
            }
        }
    }

    startWalkerAnimation(coordinates, onStep) {
        this.stopWalkerAnimation();
        if (!coordinates || coordinates.length < 2) return;

        // When coordinates are dense (snapped to real curved roads), downsample to ~22 steps
        // so the live demo progresses smoothly in ~25 seconds along the physical road!
        let animCoords = coordinates;
        if (coordinates.length > 22) {
            const numSteps = 22;
            const stepInterval = (coordinates.length - 1) / (numSteps - 1);
            animCoords = [];
            for (let i = 0; i < numSteps - 1; i++) {
                animCoords.push(coordinates[Math.round(i * stepInterval)]);
            }
            animCoords.push(coordinates[coordinates.length - 1]);
        }

        let currentIndex = 0;
        const totalSteps = animCoords.length;

        const walkerIcon = L.divIcon({
            className: 'walker-pin',
            html: `
                <div class="safe-marker-halo">
                    <span style="font-size: 16px;">🚶</span>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        this.activeCoordinates = animCoords;
        this.currentStepIndex = 0;

        this.walkerMarker = L.marker(animCoords[0], { 
            icon: walkerIcon,
            zIndexOffset: 5000 
        }).addTo(this.map);

        this.map.panTo(animCoords[0], { animate: true, duration: 0.5 });
        
        // Immediate step 0 update
        if (onStep) onStep(0, totalSteps, animCoords[0], false);

        this.walkerInterval = setInterval(() => {
            currentIndex++;
            this.currentStepIndex = currentIndex;
            if (currentIndex >= totalSteps) {
                this.stopWalkerAnimation();
                if (onStep) onStep(totalSteps - 1, totalSteps, animCoords[totalSteps - 1], true);
                return;
            }

            const currentCoord = animCoords[currentIndex];
            if (this.walkerMarker) {
                this.walkerMarker.setLatLng(currentCoord);
            }
            this.map.panTo(currentCoord, { animate: true, duration: 0.6 });

            if (onStep) onStep(currentIndex, totalSteps, currentCoord, false);
        }, 1100);
    }

    stopWalkerAnimation() {
        if (this.walkerInterval) {
            clearInterval(this.walkerInterval);
            this.walkerInterval = null;
        }
        if (this.walkerMarker) {
            this.map.removeLayer(this.walkerMarker);
            this.walkerMarker = null;
        }
        this.layers.navigation.clearLayers();
    }

    moveWalkerTo(latlng) {
        if (this.walkerInterval) {
            clearInterval(this.walkerInterval);
            this.walkerInterval = null;
        }
        if (this.walkerMarker) {
            this.walkerMarker.setLatLng(latlng);
            this.map.panTo(latlng, { animate: true, duration: 0.6 });
        }
    }

    showDeviationAlert(originCoord, deviatedCoord) {
        if (this.walkerInterval) {
            clearInterval(this.walkerInterval);
            this.walkerInterval = null;
        }

        this.layers.navigation.clearLayers();

        // Walker styling for alert state
        const walkerIcon = L.divIcon({
            className: 'walker-pin',
            html: `
                <div class="safe-marker-halo" style="box-shadow: 0 0 16px rgba(239, 68, 68, 0.9); border-color: #ef4444; background: rgba(239, 68, 68, 0.25);">
                    <span style="font-size: 16px;">🚶</span>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        if (this.walkerMarker) {
            this.walkerMarker.setIcon(walkerIcon);
            this.walkerMarker.setLatLng(deviatedCoord);
        } else {
            this.walkerMarker = L.marker(deviatedCoord, { icon: walkerIcon, zIndexOffset: 5000 }).addTo(this.map);
        }

        // Draw dotted drift line from origin route position to canal
        if (originCoord) {
            const driftLine = L.polyline([originCoord, deviatedCoord], {
                color: '#ef4444',
                weight: 4,
                dashArray: '6, 8',
                opacity: 0.95
            });
            this.layers.navigation.addLayer(driftLine);
        }

        // Add warning alert pin with pulsing ping ring
        const alertIcon = L.divIcon({
            className: 'alert-pin',
            html: `
                <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
                    <div class="alert-ping-ring" style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(239, 68, 68, 0.4);"></div>
                    <div style="position: relative; width: 28px; height: 28px; border-radius: 50%; background: #dc2626; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 14px rgba(220, 38, 38, 0.8);">
                        ⚠️
                    </div>
                </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });

        const alertMarker = L.marker(deviatedCoord, { icon: alertIcon, zIndexOffset: 4900 })
            .bindPopup(`
                <div style="font-family: inherit; font-size: 12px; color: #1e293b;">
                    <strong style="color: #dc2626; font-size: 13px;">⚠️ Off-Corridor Deviation Detected</strong>
                    <p style="margin: 4px 0 0 0; color: #475569; font-size: 11px; line-height: 1.4;">
                        Departed illuminated corridor into unlit canal bund / alleyway (0% lighting).
                    </p>
                    <div style="margin-top: 6px; padding: 4px 8px; background: #fef2f2; border-radius: 6px; font-weight: 700; color: #991b1b; font-size: 10.5px;">
                        Tap 'Recalculate Route' to navigate back to safety.
                    </div>
                </div>
            `);
        this.layers.navigation.addLayer(alertMarker);
        alertMarker.openPopup();

        this.map.panTo(deviatedCoord, { animate: true, duration: 0.7 });
    }

    clearDeviation() {
        this.layers.navigation.clearLayers();
    }

    handleMapClick(e) {
        if (this.map && this.map.getContainer()) {
            this.map.getContainer().style.cursor = '';
        }

        if (this.isSelectingLocation === 'hazard') {
            if (window.appController) {
                window.appController.openHazardModalWithCoords(e.latlng.lat, e.latlng.lng);
            }
            this.isSelectingLocation = null;
            return;
        }

        if (this.isSelectingLocation === 'start') {
            if (window.appController) window.appController.setCustomCoord('start', e.latlng.lat, e.latlng.lng);
            this.isSelectingLocation = null;
            return;
        }

        if (this.isSelectingLocation === 'end') {
            if (window.appController) window.appController.setCustomCoord('end', e.latlng.lat, e.latlng.lng);
            this.isSelectingLocation = null;
            return;
        }
    }

    // =========================================================================
    // 🧭 GOOGLE MAPS NAVIGATION ENGINE & CAMERA TRACKING
    // =========================================================================

    calculateBearing(lat1, lon1, lat2, lon2) {
        const toRad = deg => (deg * Math.PI) / 180;
        const toDeg = rad => (rad * 180) / Math.PI;
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                  Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        const brng = toDeg(Math.atan2(y, x));
        return (brng + 360) % 360;
    }

    interpolateNavCoordinates(coords, maxStepMeters = 30) {
        if (!coords || coords.length < 2) return coords;
        const interpolated = [];
        
        for (let i = 0; i < coords.length - 1; i++) {
            const p1 = coords[i];
            const p2 = coords[i + 1];
            interpolated.push(p1);

            const dist = this.calculateHaversine(p1[0], p1[1], p2[0], p2[1]);
            if (dist > maxStepMeters) {
                const subSteps = Math.min(10, Math.floor(dist / maxStepMeters));
                for (let s = 1; s <= subSteps; s++) {
                    const ratio = s / (subSteps + 1);
                    const lat = p1[0] + (p2[0] - p1[0]) * ratio;
                    const lng = p1[1] + (p2[1] - p1[1]) * ratio;
                    interpolated.push([lat, lng]);
                }
            }
        }
        interpolated.push(coords[coords.length - 1]);
        return interpolated;
    }

    startGoogleNavAnimation(rawCoordinates, options = {}, onStep) {
        this.stopGoogleNavAnimation();
        if (!rawCoordinates || rawCoordinates.length < 2) return;

        // Smooth densification along the actual physical road polyline
        const animCoords = this.interpolateNavCoordinates(rawCoordinates, 30);
        this.googleNavCoords = animCoords;
        this.googleNavStepIndex = 0;
        this.isGoogleNavActive = true;
        this.isCameraFollowLocked = true;
        this.isNavPaused = false;
        this.navOptions = options;
        this.navOnStepCallback = onStep;

        const totalSteps = animCoords.length;
        const firstCoord = animCoords[0];
        const secondCoord = animCoords[1] || firstCoord;
        const initialBearing = this.calculateBearing(firstCoord[0], firstCoord[1], secondCoord[0], secondCoord[1]);
        this.currentNavBearing = initialBearing;

        // Create the Google Maps 3D Directional Chevron Marker
        this.renderGoogleNavMarker(firstCoord[0], firstCoord[1], initialBearing);

        // Zoom in to navigation street level (zoom 16) and center
        this.map.setView(firstCoord, Math.max(this.map.getZoom(), 16), { animate: true });

        // Listen for user map drag to detach camera auto-follow
        this._onMapDragHandler = () => {
            if (this.isGoogleNavActive && this.isCameraFollowLocked) {
                this.isCameraFollowLocked = false;
                if (this.navOptions && this.navOptions.onCameraBreakFollow) {
                    this.navOptions.onCameraBreakFollow();
                }
            }
        };
        this.map.on('dragstart', this._onMapDragHandler);

        // Immediate step 0 update
        if (onStep) {
            onStep(0, totalSteps, firstCoord, initialBearing, false);
        }

        // Start step interval
        this._startNavTimer();
    }

    _startNavTimer() {
        if (this.googleNavInterval) {
            clearInterval(this.googleNavInterval);
            this.googleNavInterval = null;
        }

        const baseIntervalMs = 750;
        const intervalMs = Math.max(150, Math.round(baseIntervalMs / (this.navSpeedMultiplier || 1)));

        this.googleNavInterval = setInterval(() => {
            if (this.isNavPaused) return;

            this.googleNavStepIndex++;
            const totalSteps = this.googleNavCoords ? this.googleNavCoords.length : 0;

            if (this.googleNavStepIndex >= totalSteps) {
                // Reached destination!
                const finalCoord = this.googleNavCoords[totalSteps - 1];
                this.updateGoogleNavMarker(finalCoord[0], finalCoord[1], this.currentNavBearing);
                if (this.navOnStepCallback) {
                    this.navOnStepCallback(totalSteps - 1, totalSteps, finalCoord, this.currentNavBearing, true);
                }
                clearInterval(this.googleNavInterval);
                this.googleNavInterval = null;
                return;
            }

            const currentCoord = this.googleNavCoords[this.googleNavStepIndex];
            const nextCoord = this.googleNavCoords[Math.min(totalSteps - 1, this.googleNavStepIndex + 1)];

            // Calculate bearing to next position
            if (nextCoord) {
                const targetBearing = this.calculateBearing(currentCoord[0], currentCoord[1], nextCoord[0], nextCoord[1]);
                // Shortest angular turn interpolation
                const diff = ((targetBearing - this.currentNavBearing + 540) % 360) - 180;
                this.currentNavBearing = this.currentNavBearing + diff;
            }

            // Update arrow marker position & rotation
            this.updateGoogleNavMarker(currentCoord[0], currentCoord[1], this.currentNavBearing);

            // Follow camera if locked
            if (this.isCameraFollowLocked) {
                const stepDurationSec = (intervalMs / 1000) * 0.95;
                this.map.panTo(currentCoord, { animate: true, duration: stepDurationSec });
            }

            // Trigger UI update callback
            if (this.navOnStepCallback) {
                this.navOnStepCallback(this.googleNavStepIndex, totalSteps, currentCoord, this.currentNavBearing, false);
            }
        }, intervalMs);
    }

    renderGoogleNavMarker(lat, lng, bearing) {
        if (this.googleNavMarker) {
            this.map.removeLayer(this.googleNavMarker);
            this.googleNavMarker = null;
        }

        const navIcon = L.divIcon({
            className: 'gnav-marker-wrapper',
            html: `
                <div class="gnav-heading-cone"></div>
                <div class="gnav-chevron-rotator" id="gnavChevronRotator" style="transform: rotate(${Math.round(bearing)}deg);">
                    <svg class="gnav-chevron-icon" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 3L32 31L18 23L4 31L18 3Z" fill="#0284c7" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
                        <path d="M18 3L32 31L18 23V3Z" fill="#38bdf8"/>
                        <circle cx="18" cy="20" r="2.5" fill="#ffffff"/>
                    </svg>
                </div>
            `,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });

        this.googleNavMarker = L.marker([lat, lng], {
            icon: navIcon,
            pane: 'markersPane',
            zIndexOffset: 9500
        }).addTo(this.map);
    }

    updateGoogleNavMarker(lat, lng, bearing) {
        if (!this.googleNavMarker) {
            this.renderGoogleNavMarker(lat, lng, bearing);
            return;
        }

        this.googleNavMarker.setLatLng([lat, lng]);

        const rotator = document.getElementById('gnavChevronRotator');
        if (rotator) {
            rotator.style.transform = `rotate(${Math.round(bearing)}deg)`;
        }
    }

    setGoogleNavSpeed(multiplier) {
        this.navSpeedMultiplier = multiplier;
        if (this.isGoogleNavActive && this.googleNavInterval) {
            this._startNavTimer();
        }
    }

    toggleGoogleNavPause() {
        this.isNavPaused = !this.isNavPaused;
        return this.isNavPaused;
    }

    recenterGoogleNavCamera() {
        this.isCameraFollowLocked = true;
        if (this.googleNavCoords && this.googleNavCoords[this.googleNavStepIndex]) {
            const cur = this.googleNavCoords[this.googleNavStepIndex];
            this.map.setView(cur, 16, { animate: true });
        }
        if (this.navOptions && this.navOptions.onCameraLocked) {
            this.navOptions.onCameraLocked();
        }
    }

    stopGoogleNavAnimation() {
        if (this.googleNavInterval) {
            clearInterval(this.googleNavInterval);
            this.googleNavInterval = null;
        }
        if (this.googleNavMarker) {
            this.map.removeLayer(this.googleNavMarker);
            this.googleNavMarker = null;
        }
        if (this._onMapDragHandler) {
            this.map.off('dragstart', this._onMapDragHandler);
            this._onMapDragHandler = null;
        }
        this.isGoogleNavActive = false;
        this.isCameraFollowLocked = true;
        this.isNavPaused = false;
        this.googleNavCoords = null;
        this.googleNavStepIndex = 0;
    }
}

const safeMap = new SafeMapController();
