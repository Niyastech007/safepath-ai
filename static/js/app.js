/**
 * SafePath AI - Application Controller & User Interface Logic (Enhanced Hackathon MVP)
 * Handles route calculation, live telemetry, weather status, XAI explanations,
 * SafeWalk navigation, route deviation detection, and emergency tools.
 */

class SafePathApp {
    constructor() {
        this.cityData = null;
        this.routesData = null;
        this.selectedRouteKey = 'safest';
        this.timeMode = 'night'; // 'night', 'evening', 'day'
        this.isNavigating = false;
        this.isDeviated = false;
        this.currentWalkerCoord = null;
        this.customStart = null;
        this.customEnd = null;
        this.tempHazardCoords = { lat: 10.8200, lng: 78.6920 };
        this.currentTab = 'navigate';
        this.cachedWeatherData = null;
        this.sidebarCollapsed = false;

        // 📞 Fake Call & Custom Audio State
        this.fakeCallSettings = {
            callerName: "Dad ❤️",
            callerNumber: "Mobile +91 94431-02938",
            avatar: "👨",
            audioMode: "custom", // 'custom' (plays recorded/uploaded audio) or 'ai' (Dad speech)
            customAudioData: null,
            customAudioName: null,
            customAudioDuration: 0
        };
        this.mediaRecorder = null;
        this.recordedAudioChunks = [];
        this.isRecordingAudio = false;
        this.audioRecordTimer = null;
        this.audioRecordSec = 0;

        // 🧭 Google Maps Live Navigation State
        this.isGoogleNavigating = false;
        this.isVoiceMuted = false;
        this.navSpeedMultiplier = 1;
        this.isNavPaused = false;
        this.googleNavManeuvers = [];
        this.lastAnnouncedManeuverIdx = -1;
    }

    async init() {
        // 1. Initialize map and bind event listeners
        try {
            safeMap.init('map');
        } catch(e) {
            console.error("Map init error:", e);
        }

        this.bindEvents();
        this.initFakeCallSettings();
        this.setTimeMode(this.timeMode || 'night', false);
        this.switchTab('navigate');

        // 2. Load city network data & live safety status
        await this.loadCityData();
        await this.fetchSafetyStatus();
        await this.checkGoogleMapsStatus();

        // 3. Calculate initial routes
        await this.fetchRoutes();
    }

    async loadCityData() {
        try {
            const res = await fetch('/api/city-data');
            const data = await res.json();
            this.cityData = data;
            
            // Populate presets dropdown
            const presetSelect = document.getElementById('presetSelect');
            if (presetSelect && this.cityData.presets) {
                presetSelect.innerHTML = this.cityData.presets.map(p => `
                    <option value="${p.id}">${p.name}</option>
                `).join('');
            }

            // Populate Start and End Node selects
            const startSelect = document.getElementById('startNodeSelect');
            const endSelect = document.getElementById('endNodeSelect');
            
            if (startSelect && endSelect && this.cityData.nodes) {
                const nodeOptions = this.cityData.nodes.map(n => `
                    <option value="${n.id}">${n.name} ${n.is_safe_haven ? '🛡️' : ''}</option>
                `).join('');

                startSelect.innerHTML = nodeOptions;
                endSelect.innerHTML = nodeOptions;

                // Synchronize default: match the first preset (Saranathan -> CBS)
                if (this.cityData.presets && this.cityData.presets.length > 0) {
                    startSelect.value = this.cityData.presets[0].start_node;
                    endSelect.value = this.cityData.presets[0].end_node;
                } else {
                    startSelect.value = 'n_saranathan';
                    endSelect.value = 'n_central_bs';
                }
            }

            // Load map POIs and streetlights
            safeMap.loadCityLayers(this.cityData);
            this.updateNearbySupportPanel();
        } catch (err) {
            console.error('Failed to load city data:', err);
        }
    }

    async fetchSafetyStatus() {
        try {
            const res = await fetch('/api/safety-status');
            const data = await res.json();
            if (!data.success) return;

            const w = data.weather || {};
            this.cachedWeatherData = w;
            const iconEl = document.getElementById('weatherIcon');
            const tempEl = document.getElementById('weatherTemp');
            const condEl = document.getElementById('weatherCondition');
            const liveBadge = document.getElementById('weatherLiveBadge');
            const hazCount = document.getElementById('dashHazardsCount');
            const confEl = document.getElementById('dashConfidenceScore');
            const updatedEl = document.getElementById('dashLastUpdated');
            const advBar = document.getElementById('weatherAdvisoryText');

            if (iconEl && w.icon) iconEl.innerText = w.icon;
            if (tempEl && w.temperature_c) tempEl.innerText = `${w.temperature_c}°C`;
            if (condEl && w.condition) condEl.innerText = `${w.condition} (Trichy)`;
            if (liveBadge) {
                liveBadge.innerText = w.is_live ? "LIVE" : "CACHED";
                liveBadge.className = w.is_live ? "badge-micro badge-live" : "badge-micro badge-conf";
            }
            if (hazCount) hazCount.innerText = `${data.active_hazards_count} Active`;
            if (confEl) confEl.innerText = data.data_confidence || "High (86%)";
            if (updatedEl && data.last_updated) updatedEl.innerText = `Updated: ${data.last_updated}`;
            if (advBar && w.advisory) advBar.innerText = w.advisory;

            // Populate Weather Modal
            const mIcon = document.getElementById('modalWeatherIcon');
            const mTemp = document.getElementById('modalWeatherTemp');
            const mCond = document.getElementById('modalWeatherCondition');
            const mHum = document.getElementById('modalWeatherHumidity');
            const mWind = document.getElementById('modalWeatherWind');
            const mPrecip = document.getElementById('modalWeatherPrecip');
            const mPen = document.getElementById('modalWeatherPenalty');
            if (mIcon && w.icon) mIcon.innerText = w.icon;
            if (mTemp && w.temperature_c) mTemp.innerText = `${w.temperature_c}°C`;
            if (mCond && w.condition) mCond.innerText = w.condition;
            if (mHum && w.humidity_pct !== undefined) mHum.innerText = `${w.humidity_pct}%`;
            if (mWind && w.wind_speed_kmh !== undefined) mWind.innerText = `${w.wind_speed_kmh} km/h`;
            if (mPrecip && w.precipitation_mm !== undefined) mPrecip.innerText = `${w.precipitation_mm} mm`;
            if (mPen && w.penalty !== undefined) mPen.innerText = `${w.penalty.toFixed(2)} (${w.penalty > 0 ? 'Adverse Modifier' : 'Optimal'})`;
        } catch (e) {
            console.warn("Failed to fetch safety status:", e);
        }
    }

    bindEvents() {
        // Preset selector change
        const presetSelect = document.getElementById('presetSelect');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                if (!this.cityData || !this.cityData.presets) return;
                const selectedPreset = this.cityData.presets.find(p => p.id === e.target.value);
                if (selectedPreset) {
                    const startSel = document.getElementById('startNodeSelect');
                    const endSel = document.getElementById('endNodeSelect');
                    if (startSel) startSel.value = selectedPreset.start_node;
                    this.customStart = null;
                    this.customEnd = null;
                    this.customStartCoords = null;
                    this.fetchRoutes();
                }
            });
        }

        // Start & End selector changes
        const startSelect = document.getElementById('startNodeSelect');
        if (startSelect) {
            startSelect.addEventListener('change', (e) => {
                if (e.target.value !== '__custom__') {
                    this.customStartCoords = null;
                } else {
                    if (this.currentGpsLocation) {
                        this.customStartCoords = this.currentGpsLocation;
                    } else {
                        this.requestLiveLocation(true, true);
                        return;
                    }
                }
                this.fetchRoutes();
            });
        }
        
        const endSelect = document.getElementById('endNodeSelect');
        if (endSelect) endSelect.addEventListener('change', () => this.fetchRoutes());

        // Time Mode Buttons (Night, Evening, Day)
        ['night', 'evening', 'day'].forEach(mode => {
            const btn = document.getElementById(`btn-time-${mode}`);
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.setTimeMode(mode);
                });
            }
        });

        // Layer Toggles
        const toggleLights = document.getElementById('toggleLights');
        if (toggleLights) {
            toggleLights.addEventListener('change', (e) => {
                safeMap.toggleLayer('streetlights', e.target.checked);
            });
        }

        const togglePolice = document.getElementById('togglePolice');
        if (togglePolice) {
            togglePolice.addEventListener('change', (e) => {
                safeMap.toggleLayer('police', e.target.checked);
            });
        }

        const toggleHavens = document.getElementById('toggleHavens');
        if (toggleHavens) {
            toggleHavens.addEventListener('change', (e) => {
                safeMap.toggleLayer('safeHavens', e.target.checked);
            });
        }

        const toggleLiquor = document.getElementById('toggleLiquor');
        if (toggleLiquor) {
            toggleLiquor.addEventListener('change', (e) => {
                safeMap.toggleLayer('liquor', e.target.checked);
            });
        }

        const toggleHazards = document.getElementById('toggleHazards');
        if (toggleHazards) {
            toggleHazards.addEventListener('change', (e) => {
                safeMap.toggleLayer('hazards', e.target.checked);
            });
        }

        // Quick Map POI Filter Control Bar ([ 👮 Police ], [ 🏥 Hospitals ], [ 🍺 TASMAC ], [ ⚠️ Hazards ])
        const filterMapping = [
            { btnId: 'filterBtnPolice', layerKey: 'police', checkId: 'togglePolice', label: 'Police Stations' },
            { btnId: 'filterBtnHospitals', layerKey: 'safeHavens', checkId: 'toggleHavens', label: 'Hospitals & Havens' },
            { btnId: 'filterBtnLiquor', layerKey: 'liquor', checkId: 'toggleLiquor', label: 'Liquor Retail (TASMAC)' },
            { btnId: 'filterBtnHazards', layerKey: 'hazards', checkId: 'toggleHazards', label: 'Hazard Pins' },
            { btnId: 'filterBtnDebug', layerKey: 'debugGeometry', checkId: null, label: 'Debug Route Geometry' }
        ];

        filterMapping.forEach(item => {
            const btn = document.getElementById(item.btnId);
            const check = document.getElementById(item.checkId);
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const newActive = !btn.classList.contains('active');
                    btn.classList.toggle('active', newActive);
                    if (check) check.checked = newActive;
                    safeMap.toggleLayer(item.layerKey, newActive);
                    this.showNotification(`Layer ${item.label}: ${newActive ? 'Visible' : 'Hidden'}`);
                });
            }
            if (check && btn) {
                check.addEventListener('change', (e) => {
                    btn.classList.toggle('active', e.target.checked);
                });
            }
        });

        // SafeWalk Navigation Button
        const btnStartNav = document.getElementById('btnStartNav');
        if (btnStartNav) btnStartNav.addEventListener('click', () => this.toggleNavigation());

        // Test Deviation Button
        const btnSimulateDeviation = document.getElementById('btnSimulateDeviation');
        if (btnSimulateDeviation) btnSimulateDeviation.addEventListener('click', () => this.simulateDeviation());

        // Recalculate Route Mini Button
        const btnRecalculateRoute = document.getElementById('btnRecalculateRoute');
        if (btnRecalculateRoute) btnRecalculateRoute.addEventListener('click', () => this.recalculateSafeRoute());

        // Data Sources Modal
        const btnDataSources = document.getElementById('btnDataSources');
        if (btnDataSources) btnDataSources.addEventListener('click', () => this.openDataSourcesModal());

        const btnCloseDataSources = document.getElementById('btnCloseDataSources');
        if (btnCloseDataSources) btnCloseDataSources.addEventListener('click', () => this.closeDataSourcesModal());

        const btnCloseDataSourcesBottom = document.getElementById('btnCloseDataSourcesBottom');
        if (btnCloseDataSourcesBottom) btnCloseDataSourcesBottom.addEventListener('click', () => this.closeDataSourcesModal());


        // Emergency SOS Button
        const btnSOS = document.getElementById('btnSOS');
        if (btnSOS) btnSOS.addEventListener('click', () => this.triggerSOSModal());
        
        const btnCloseSOS = document.getElementById('btnCloseSOS');
        if (btnCloseSOS) btnCloseSOS.addEventListener('click', () => this.closeSOSModal());

        // Fake Call Controls
        const btnFakeCall = document.getElementById('btnFakeCall');
        if (btnFakeCall) btnFakeCall.addEventListener('click', () => this.triggerFakeCall());
        
        const btnAcceptCall = document.getElementById('btnAcceptCall');
        if (btnAcceptCall) btnAcceptCall.addEventListener('click', () => this.acceptFakeCall());
        
        const btnDeclineCall = document.getElementById('btnDeclineCall');
        if (btnDeclineCall) btnDeclineCall.addEventListener('click', () => this.closeFakeCall());
        
        const btnEndCallActive = document.getElementById('btnEndCallActive');
        if (btnEndCallActive) btnEndCallActive.addEventListener('click', () => this.closeFakeCall());

        // Fake Call Audio & Caller Setup Modal Listeners
        const btnOpenFakeCallConfig = document.getElementById('btnOpenFakeCallConfig');
        if (btnOpenFakeCallConfig) btnOpenFakeCallConfig.addEventListener('click', () => this.openFakeCallConfigModal());

        const btnOpenFakeCallConfigFromIncoming = document.getElementById('btnOpenFakeCallConfigFromIncoming');
        if (btnOpenFakeCallConfigFromIncoming) {
            btnOpenFakeCallConfigFromIncoming.addEventListener('click', () => {
                this.closeFakeCall();
                this.openFakeCallConfigModal();
            });
        }

        const btnCloseFakeCallConfig = document.getElementById('btnCloseFakeCallConfig');
        if (btnCloseFakeCallConfig) btnCloseFakeCallConfig.addEventListener('click', () => this.closeFakeCallConfigModal());

        // Audio mode selection cards
        const cardCustom = document.getElementById('cardAudioModeCustom');
        const cardAI = document.getElementById('cardAudioModeAI');
        const radioCustom = document.getElementById('radioAudioCustom');
        const radioAI = document.getElementById('radioAudioAI');

        if (cardCustom) {
            cardCustom.addEventListener('click', () => {
                this.fakeCallSettings.audioMode = 'custom';
                this.updateFakeCallUIElements();
            });
        }
        if (cardAI) {
            cardAI.addEventListener('click', () => {
                this.fakeCallSettings.audioMode = 'ai';
                this.updateFakeCallUIElements();
            });
        }
        if (radioCustom) {
            radioCustom.addEventListener('change', () => {
                this.fakeCallSettings.audioMode = 'custom';
                this.updateFakeCallUIElements();
            });
        }
        if (radioAI) {
            radioAI.addEventListener('change', () => {
                this.fakeCallSettings.audioMode = 'ai';
                this.updateFakeCallUIElements();
            });
        }

        // Avatar option buttons
        document.querySelectorAll('.avatar-opt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const av = btn.getAttribute('data-avatar');
                if (av) {
                    this.fakeCallSettings.avatar = av;
                    this.updateFakeCallUIElements();
                }
            });
        });

        // Mic recording buttons
        const btnStartMicRecord = document.getElementById('btnStartMicRecord');
        if (btnStartMicRecord) btnStartMicRecord.addEventListener('click', () => this.startMicRecording());

        const btnStopMicRecord = document.getElementById('btnStopMicRecord');
        if (btnStopMicRecord) btnStopMicRecord.addEventListener('click', () => this.stopMicRecording());

        // Audio file upload buttons
        const btnTriggerAudioUpload = document.getElementById('btnTriggerAudioUpload');
        const inputAudioFile = document.getElementById('inputAudioFile');
        if (btnTriggerAudioUpload && inputAudioFile) {
            btnTriggerAudioUpload.addEventListener('click', () => inputAudioFile.click());
            inputAudioFile.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.handleAudioFileUpload(e.target.files[0]);
                }
            });
        }

        // Saved Custom Audio Preview / Delete
        const btnTestPlaySavedAudio = document.getElementById('btnTestPlaySavedAudio');
        if (btnTestPlaySavedAudio) {
            btnTestPlaySavedAudio.addEventListener('click', () => {
                if (safeAudio.isCustomAudioPlaying) {
                    safeAudio.stopCustomAudio();
                    btnTestPlaySavedAudio.innerText = "▶️ Test Play";
                } else if (this.fakeCallSettings.customAudioData) {
                    btnTestPlaySavedAudio.innerText = "⏹️ Stop";
                    safeAudio.playCustomAudio(this.fakeCallSettings.customAudioData, () => {
                        btnTestPlaySavedAudio.innerText = "▶️ Test Play";
                    });
                }
            });
        }

        const btnDeleteSavedAudio = document.getElementById('btnDeleteSavedAudio');
        if (btnDeleteSavedAudio) {
            btnDeleteSavedAudio.addEventListener('click', () => this.deleteSavedCustomAudio());
        }

        // Test AI Voice Speech
        const btnTestAIVoice = document.getElementById('btnTestAIVoice');
        if (btnTestAIVoice) {
            btnTestAIVoice.addEventListener('click', () => {
                const name = document.getElementById('inputFakeCallerName')?.value || this.fakeCallSettings.callerName || "Dad";
                safeAudio.speakCallerScript(null, name);
            });
        }

        // Save & Test Call from Config Modal
        const btnSaveFakeCallSettings = document.getElementById('btnSaveFakeCallSettings');
        if (btnSaveFakeCallSettings) {
            btnSaveFakeCallSettings.addEventListener('click', () => {
                const name = document.getElementById('inputFakeCallerName')?.value.trim();
                const num = document.getElementById('inputFakeCallerNumber')?.value.trim();
                if (name) this.fakeCallSettings.callerName = name;
                if (num) this.fakeCallSettings.callerNumber = num;
                this.saveFakeCallSettings();
                this.closeFakeCallConfigModal();
                this.showNotification(`✓ Fake call configured for ${this.fakeCallSettings.callerName}!`);
            });
        }

        const btnTestTriggerFakeCall = document.getElementById('btnTestTriggerFakeCall');
        if (btnTestTriggerFakeCall) {
            btnTestTriggerFakeCall.addEventListener('click', () => {
                const name = document.getElementById('inputFakeCallerName')?.value.trim();
                const num = document.getElementById('inputFakeCallerNumber')?.value.trim();
                if (name) this.fakeCallSettings.callerName = name;
                if (num) this.fakeCallSettings.callerNumber = num;
                this.saveFakeCallSettings();
                this.closeFakeCallConfigModal();
                this.triggerFakeCall();
            });
        }

        // Report Hazard Buttons
        const btnReportHazard = document.getElementById('btnReportHazard');
        if (btnReportHazard) btnReportHazard.addEventListener('click', () => this.openHazardModal());
        
        const btnSubmitHazard = document.getElementById('btnSubmitHazard');
        if (btnSubmitHazard) btnSubmitHazard.addEventListener('click', () => this.submitHazard());
        
        const btnCancelHazard = document.getElementById('btnCancelHazard');
        if (btnCancelHazard) btnCancelHazard.addEventListener('click', () => this.closeHazardModal());

        // Share Trip Link
        const btnShareTrip = document.getElementById('btnShareTrip');
        if (btnShareTrip) btnShareTrip.addEventListener('click', () => this.shareLiveTrip());

        // 🗺️ Map Multi-View Switcher Buttons (Google Streets, Satellite, Pure Sat, Dark, Terrain)
        document.querySelectorAll('.map-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const view = btn.dataset.view;
                if (view) {
                    safeMap.setBasemap(view);
                    const viewName = (typeof BASEMAP_TILES !== 'undefined' && BASEMAP_TILES[view]) ? BASEMAP_TILES[view].name : view;
                    this.showNotification(`🗺️ Map View changed to: ${viewName}`);
                    if (view === 'dark-night' && this.timeMode !== 'night') {
                        this.setTimeMode('night', false);
                    }
                }
            });
        });

        // 📍 Floating Live GPS Location Button on Map
        const btnLocateMe = document.getElementById('btnLocateMe');
        if (btnLocateMe) {
            btnLocateMe.addEventListener('click', (e) => {
                e.preventDefault();
                this.requestLiveLocation(true, true);
            });
        }

        // 📍 Live GPS Quick Button in Origin Form
        const btnUseLiveGPS = document.getElementById('btnUseLiveGPS');
        if (btnUseLiveGPS) {
            btnUseLiveGPS.addEventListener('click', (e) => {
                e.preventDefault();
                this.requestLiveLocation(true, true);
            });
        }

        // 🎯 Pick on Map Quick Button in Origin Form
        const btnPinStartOnMap = document.getElementById('btnPinStartOnMap');
        if (btnPinStartOnMap) {
            btnPinStartOnMap.addEventListener('click', (e) => {
                e.preventDefault();
                this.startMapPinOrigin();
            });
        }

        // 🗺️ Desktop Navigation Tabs
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = btn.dataset.tab;
                if (tab) this.switchTab(tab);
            });
        });

        // 📱 Mobile Bottom Navigation Tabs
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = btn.dataset.tab;
                if (tab) this.switchTab(tab);
            });
        });

        // 📱 Mobile Close / Open Panel Buttons
        const btnMobileCloseSidebar = document.getElementById('btnMobileCloseSidebar');
        if (btnMobileCloseSidebar) {
            btnMobileCloseSidebar.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab('map');
            });
        }
        const btnMobileOpenPanel = document.getElementById('btnMobileOpenPanel');
        if (btnMobileOpenPanel) {
            btnMobileOpenPanel.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab('navigate');
            });
        }

        // ‹/› Collapsible Sidebar Toggle
        const btnToggleSidebar = document.getElementById('btnToggleSidebar');
        if (btnToggleSidebar) {
            btnToggleSidebar.addEventListener('click', () => this.toggleSidebar());
        }

        // 🔍 Primary Find Safe Routes Button
        const btnFindRoutes = document.getElementById('btnFindRoutes');
        if (btnFindRoutes) {
            btnFindRoutes.addEventListener('click', (e) => {
                e.preventDefault();
                this.fetchRoutes();
            });
        }

        // 🌤️ Header Weather Widget Click -> Weather Modal
        const headerWeatherWidget = document.getElementById('headerWeatherWidget');
        if (headerWeatherWidget) {
            headerWeatherWidget.addEventListener('click', () => this.openWeatherModal());
        }

        const btnCloseWeatherModal = document.getElementById('btnCloseWeatherModal');
        if (btnCloseWeatherModal) btnCloseWeatherModal.addEventListener('click', () => this.closeWeatherModal());

        const btnCloseWeatherModalBottom = document.getElementById('btnCloseWeatherModalBottom');
        if (btnCloseWeatherModalBottom) btnCloseWeatherModalBottom.addEventListener('click', () => this.closeWeatherModal());

        // 🛡️ Header Data Widget Click -> Data Transparency Modal
        const headerDataWidget = document.getElementById('headerDataWidget');
        if (headerDataWidget) {
            headerDataWidget.addEventListener('click', () => this.openDataSourcesModal());
        }

        // 🗺️ Floating Map Layers Dropdown Button & Checkboxes
        const btnLayersDropdown = document.getElementById('btnLayersDropdown');
        const layersDropdownMenu = document.getElementById('layersDropdownMenu');
        if (btnLayersDropdown && layersDropdownMenu) {
            btnLayersDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                layersDropdownMenu.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!layersDropdownMenu.contains(e.target) && e.target !== btnLayersDropdown) {
                    layersDropdownMenu.classList.add('hidden');
                }
            });
        }

        const dropdownLayerMapping = [
            { chkId: 'chkLayerLights', altId: 'toggleLights', key: 'streetlights' },
            { chkId: 'chkLayerPolice', altId: 'togglePolice', key: 'police', filterId: 'filterBtnPolice' },
            { chkId: 'chkLayerHavens', altId: 'toggleHavens', key: 'safeHavens', filterId: 'filterBtnHospitals' },
            { chkId: 'chkLayerLiquor', altId: 'toggleLiquor', key: 'liquor', filterId: 'filterBtnLiquor' },
            { chkId: 'chkLayerHazards', altId: 'toggleHazards', key: 'hazards', filterId: 'filterBtnHazards' }
        ];

        dropdownLayerMapping.forEach(item => {
            const chk = document.getElementById(item.chkId);
            const altChk = document.getElementById(item.altId);
            const filterBtn = item.filterId ? document.getElementById(item.filterId) : null;

            if (chk) {
                chk.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    if (altChk) altChk.checked = isChecked;
                    if (filterBtn) filterBtn.classList.toggle('active', isChecked);
                    safeMap.toggleLayer(item.key, isChecked);
                });
            }
            if (altChk && chk) {
                altChk.addEventListener('change', (e) => {
                    chk.checked = e.target.checked;
                });
            }
        });

        // 🚨 Emergency Tab Buttons
        const btnEmergencySOS = document.getElementById('btnEmergencySOS');
        if (btnEmergencySOS) btnEmergencySOS.addEventListener('click', () => this.triggerSOSModal());

        const btnEmergencyFakeCall = document.getElementById('btnEmergencyFakeCall');
        if (btnEmergencyFakeCall) btnEmergencyFakeCall.addEventListener('click', () => this.triggerFakeCall());

        const btnEmergencyShareTrip = document.getElementById('btnEmergencyShareTrip');
        if (btnEmergencyShareTrip) btnEmergencyShareTrip.addEventListener('click', () => this.shareLiveTrip());

        const btnEmergencyRefreshGPS = document.getElementById('btnEmergencyRefreshGPS');
        if (btnEmergencyRefreshGPS) {
            btnEmergencyRefreshGPS.addEventListener('click', () => {
                this.requestLiveLocation(true, true);
                this.showNotification('🛰️ Refreshing GPS lock for emergency dispatch...');
            });
        }

        // ⚠️ Community Hazard Tab Form Buttons
        const btnHazardUseGPS = document.getElementById('btnHazardUseGPS');
        if (btnHazardUseGPS) {
            btnHazardUseGPS.addEventListener('click', () => {
                if (this.currentGpsLocation) {
                    this.setHazardFormCoords(this.currentGpsLocation[0], this.currentGpsLocation[1]);
                    this.showNotification('📍 Set hazard location to current GPS position.');
                } else {
                    this.requestLiveLocation(true, false);
                }
            });
        }

        const btnHazardPickMap = document.getElementById('btnHazardPickMap');
        if (btnHazardPickMap) {
            btnHazardPickMap.addEventListener('click', () => {
                safeMap.isSelectingLocation = 'hazard';
                this.showNotification('🗺️ Click anywhere on the map to pin the hazard location!');
            });
        }

        const btnSubmitModalHazard = document.getElementById('btnSubmitModalHazard');
        if (btnSubmitModalHazard) {
            btnSubmitModalHazard.addEventListener('click', () => this.submitModalHazard());
        }

        const btnCancelModalHazard = document.getElementById('btnCancelModalHazard');
        if (btnCancelModalHazard) {
            btnCancelModalHazard.addEventListener('click', () => this.closeHazardModal());
        }

        // Deviation Alert Dismiss Button
        const btnDismissDeviation = document.getElementById('btnDismissDeviation');
        if (btnDismissDeviation) {
            btnDismissDeviation.addEventListener('click', () => {
                const devStrip = document.getElementById('deviationAlertStrip');
                if (devStrip) {
                    devStrip.classList.add('hidden');
                    devStrip.style.display = 'none';
                }
            });
        }
    }

    switchTab(tabId) {
        this.currentTab = tabId;

        // 1. Desktop Nav Tab buttons
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 2. Mobile Nav buttons
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const sidebar = document.getElementById('sidebarPanel');

        // Special handling for Mobile Map View
        if (tabId === 'map') {
            if (sidebar) sidebar.classList.add('mobile-hidden');
            if (window.safeMap && safeMap.map) {
                setTimeout(() => safeMap.map.invalidateSize(), 200);
            }
            return;
        }

        // For all other tabs (navigate, safety, emergency, nearby, report): show sidebar panel
        if (sidebar) {
            sidebar.classList.remove('mobile-hidden');
            if (sidebar.classList.contains('collapsed')) {
                this.toggleSidebar(false);
            }
        }

        // 3. Tab Panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            if (pane.id === `pane-${tabId}`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });

        // 4. Update Sidebar Top Bar Mode Label
        const titleEl = document.getElementById('sidebarCurrentTabTitle');
        const titles = {
            navigate: 'ROUTE PLANNER',
            safety: 'SAFETY ANALYSIS',
            emergency: 'EMERGENCY HUB',
            nearby: 'NEARBY SUPPORT',
            report: 'REPORT HAZARD'
        };
        if (titleEl) titleEl.innerText = titles[tabId] || 'ROUTE PLANNER';

        // 5. Tab-specific updates
        if (tabId === 'safety') {
            this.updateExplainableAIPanel();
            this.renderWhyNotFastest();
        } else if (tabId === 'nearby') {
            this.updateNearbySupportPanel();
        } else if (tabId === 'emergency') {
            this.updateEmergencyPanel();
        }

        // 6. Refresh Leaflet map dimensions
        if (window.safeMap && safeMap.map) {
            setTimeout(() => safeMap.map.invalidateSize(), 150);
        }
    }

    toggleSidebar(forceState = null) {
        const sidebar = document.getElementById('sidebarPanel');
        const toggleBtn = document.getElementById('btnToggleSidebar');
        if (!sidebar) return;

        const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
        const willCollapse = (forceState !== null) ? forceState : !isCurrentlyCollapsed;

        if (willCollapse) {
            sidebar.classList.add('collapsed');
            if (toggleBtn) {
                toggleBtn.innerHTML = '›';
                toggleBtn.title = 'Expand Feature Panel';
                toggleBtn.classList.add('collapsed');
            }
            this.sidebarCollapsed = true;
        } else {
            sidebar.classList.remove('collapsed');
            if (toggleBtn) {
                toggleBtn.innerHTML = '‹';
                toggleBtn.title = 'Collapse Sidebar for Fullscreen Map';
                toggleBtn.classList.remove('collapsed');
            }
            this.sidebarCollapsed = false;
        }

        if (window.safeMap && safeMap.map) {
            setTimeout(() => safeMap.map.invalidateSize(), 250);
        }
    }

    openWeatherModal() {
        const modal = document.getElementById('weatherModal');
        if (modal) modal.classList.remove('hidden');
    }

    closeWeatherModal() {
        const modal = document.getElementById('weatherModal');
        if (modal) modal.classList.add('hidden');
    }

    updateEmergencyPanel() {
        const gpsDisplay = document.getElementById('emergencyGPSDisplay');
        const coords = this.currentWalkerCoord || (this.currentGpsLocation ? this.currentGpsLocation : this.getCurrentOriginCoords());
        if (gpsDisplay) {
            const label = this.currentWalkerCoord ? 'Walker Live Route Fix' : (this.currentGpsLocation ? 'GPS Live Fix' : `${this.getOriginNodeName()} Fix`);
            gpsDisplay.innerText = `${coords[0].toFixed(4)}° N, ${coords[1].toFixed(4)}° E (${label})`;
        }
        this.updateNearbySupportPanel(coords);
    }

    updateJourneyPanel() {
        if (this.currentWalkerCoord) {
            this.updateNearbySupportPanel(this.currentWalkerCoord);
        }
    }

    setHazardFormCoords(lat, lng) {
        this.tempHazardCoords = { lat, lng };
        const coordText = document.getElementById('hazardCoordText');
        const formCoord = document.getElementById('hazardReportFormCoord');
        const coordStr = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
        if (coordText) coordText.innerText = `Location: ${coordStr} (Trichy)`;
        if (formCoord) formCoord.innerText = coordStr;
    }

    async submitModalHazard() {
        const modalCat = document.getElementById('modalHazardCategorySelect');
        const modalDesc = document.getElementById('modalHazardDescInput');
        const mainCat = document.getElementById('hazardCategorySelect');
        const mainDesc = document.getElementById('hazardDescInput');
        if (modalCat && mainCat) mainCat.value = modalCat.value;
        if (modalDesc && mainDesc) mainDesc.value = modalDesc.value;
        await this.submitHazard();
    }

    setTimeMode(mode, showNotification = true) {
        this.timeMode = mode;
        this.updateCommuteContextUI();

        // Synchronize map visual theme (night, evening, day)
        if (typeof safeMap !== 'undefined' && safeMap.setTileTheme) {
            safeMap.setTileTheme(mode);
        }

        const toastMessages = {
            night: '🌙 Switched to Night Mode (Illumination & Police Proximity Prioritized)',
            evening: '🌆 Switched to Evening Mode (Balanced Peak Transit Weighting)',
            day: '☀️ Switched to Day Mode (Pedestrian Footfall & Active Streets Prioritized)'
        };

        if (showNotification && toastMessages[mode]) {
            this.showNotification(toastMessages[mode]);
        }

        if (this.cityData) {
            this.fetchRoutes(true);
        }
    }

    updateCommuteContextUI() {
        ['night', 'evening', 'day'].forEach(m => {
            const btn = document.getElementById(`btn-time-${m}`);
            if (btn) {
                if (m === this.timeMode) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });

        const banner = document.getElementById('commuteContextBanner');
        const iconEl = document.getElementById('commuteContextIcon');
        const titleEl = document.getElementById('commuteContextTitle');
        const descEl = document.getElementById('commuteContextDesc');

        const contextInfo = {
            night: {
                icon: '🌙',
                title: 'Night Safety Priority',
                desc: 'Streetlight coverage (35%) & police emergency radius (15%) prioritized. Hazard penalties weighted 1.3×.',
                cls: 'mode-night'
            },
            evening: {
                icon: '🌆',
                title: 'Evening Commute Mode',
                desc: 'Balanced transit weighting — active commercial corridors (25%) & early lighting (25%) prioritized.',
                cls: 'mode-evening'
            },
            day: {
                icon: '☀️',
                title: 'Daytime Mobility Mode',
                desc: 'High pedestrian footfall (30%) & open commercial avenues prioritized. Direct walking paths optimized.',
                cls: 'mode-day'
            }
        };

        const info = contextInfo[this.timeMode] || contextInfo.night;
        if (banner) {
            banner.className = `commute-context-strip ${info.cls}`;
        }
        if (iconEl) iconEl.innerText = info.icon;
        if (titleEl) titleEl.innerText = info.title;
        if (descEl) descEl.innerText = info.desc;
    }

    startMapPinOrigin() {
        if (!safeMap || !safeMap.map) return;
        safeMap.isSelectingLocation = 'start';
        if (safeMap.map.getContainer()) {
            safeMap.map.getContainer().style.cursor = 'crosshair';
        }
        this.showNotification('🎯 Click anywhere on the map to set your live starting origin (A).');
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    requestLiveLocation(panToLocation = true, autoSetStart = true) {
        const gpsBtn = document.getElementById('btnLocateMe');
        const gpsLabel = document.getElementById('gpsStatusText');

        // If continuous tracking is already active and we have coordinates, re-center map
        if (this.isGpsTracking && this.currentGpsLocation) {
            safeMap.centerOnLocation(this.currentGpsLocation[0], this.currentGpsLocation[1], 16);
            this.showNotification(`📍 Centered on your Live GPS position: [${this.currentGpsLocation[0].toFixed(4)}, ${this.currentGpsLocation[1].toFixed(4)}]`);
            return;
        }

        if (gpsBtn) gpsBtn.classList.add('locating');
        if (gpsLabel) gpsLabel.innerText = 'Locating...';

        // Check if browser context allows geolocation (HTTPS or localhost)
        const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (!('geolocation' in navigator) || (!isSecure && window.location.protocol !== 'https:')) {
            const reason = !('geolocation' in navigator) ?
                'Browser does not support Geolocation API.' :
                'Browser security restricts device GPS on network HTTP (192.168.x.x).';
            this.showNotification(`⚠️ ${reason} Falling back to Network IP location...`);
            this.fetchIpLocation(panToLocation, autoSetStart);
            return;
        }

        this.showNotification('🛰️ Acquiring live GPS satellite position...');

        // Multi-tier acquisition: First try high-accuracy GNSS hardware
        const tryHighAccuracy = () => {
            navigator.geolocation.getCurrentPosition(
                (pos) => this.handleGpsSuccess(pos, panToLocation, autoSetStart),
                (err) => {
                    console.warn("High-accuracy GPS failed, trying Wi-Fi / Network location:", err);
                    if (err.code === 1) {
                        this.showNotification('⚠️ Location permission denied or restricted. Using Network IP location...');
                        this.fetchIpLocation(panToLocation, autoSetStart);
                    } else {
                        this.showNotification('🛰️ GPS satellite query timed out. Retrying with Wi-Fi / Cell location...');
                        tryLowAccuracy();
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: 9000,
                    maximumAge: 30000
                }
            );
        };

        // Tier 2: Low-accuracy Wi-Fi / Network fallback
        const tryLowAccuracy = () => {
            navigator.geolocation.getCurrentPosition(
                (pos) => this.handleGpsSuccess(pos, panToLocation, autoSetStart),
                (err) => {
                    console.warn("Low-accuracy location failed, falling back to IP:", err);
                    this.showNotification('⚠️ Device GPS unavailable. Estimating position via Network IP...');
                    this.fetchIpLocation(panToLocation, autoSetStart);
                },
                {
                    enableHighAccuracy: false,
                    timeout: 12000,
                    maximumAge: 300000
                }
            );
        };

        tryHighAccuracy();
    }

    handleGpsSuccess(pos, panToLocation = true, autoSetStart = true) {
        const gpsBtn = document.getElementById('btnLocateMe');
        const gpsLabel = document.getElementById('gpsStatusText');
        if (gpsBtn) {
            gpsBtn.classList.remove('locating');
            gpsBtn.classList.add('tracking-active');
        }
        if (gpsLabel) gpsLabel.innerText = 'GPS: Active';

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 15;
        this.currentGpsLocation = [lat, lng];

        // Update animated GPS beacon marker on map
        safeMap.updateUserLocationMarker(lat, lng, accuracy, (uLat, uLng) => {
            this.setGpsAsStartOrigin(uLat, uLng);
        });

        if (panToLocation) {
            safeMap.centerOnLocation(lat, lng, 16);
        }

        // Distance from Trichy check
        const distFromTrichy = this.calculateDistance(lat, lng, 10.7905, 78.7047);
        if (distFromTrichy > 45000) {
            const distKm = Math.round(distFromTrichy / 1000);
            this.showNotification(`📍 GPS Locked: [${lat.toFixed(4)}, ${lng.toFixed(4)}] (${distKm}km from Trichy). Route calculated from your location!`);
        } else {
            this.showNotification(`📍 Live GPS Locked (±${Math.round(accuracy)}m). Route calculated directly from your location!`);
        }

        if (autoSetStart) {
            this.setGpsAsStartOrigin(lat, lng);
        }

        // Start continuous background live GPS tracking
        this.startLiveGpsTracking();
    }

    startLiveGpsTracking() {
        if (!('geolocation' in navigator) || this.gpsWatchId !== null) return;
        this.isGpsTracking = true;

        this.gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const accuracy = pos.coords.accuracy || 15;
                this.currentGpsLocation = [lat, lng];

                // Smoothly update marker on map
                if (safeMap && safeMap.userGpsMarker) {
                    safeMap.userGpsMarker.setLatLng([lat, lng]);
                } else if (safeMap) {
                    safeMap.updateUserLocationMarker(lat, lng, accuracy);
                }

                const gpsDisplay = document.getElementById('emergencyGPSDisplay');
                if (gpsDisplay) {
                    gpsDisplay.innerText = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E (GPS Live Tracking)`;
                }
            },
            (err) => {
                console.warn("Continuous GPS watch warning:", err);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 20000
            }
        );
    }

    stopLiveGpsTracking() {
        if (this.gpsWatchId !== null && 'geolocation' in navigator) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }
        this.isGpsTracking = false;
        const gpsBtn = document.getElementById('btnLocateMe');
        const gpsLabel = document.getElementById('gpsStatusText');
        if (gpsBtn) {
            gpsBtn.classList.remove('locating', 'tracking-active');
        }
        if (gpsLabel) gpsLabel.innerText = 'Live GPS';
    }

    async fetchIpLocation(panToLocation = true, autoSetStart = true) {
        const gpsBtn = document.getElementById('btnLocateMe');
        const gpsLabel = document.getElementById('gpsStatusText');

        try {
            const res = await fetch('/api/locate-ip');
            const data = await res.json();
            if (data.success && data.lat && data.lng) {
                const lat = data.lat;
                const lng = data.lng;
                const accuracy = data.accuracy_m || 500;
                this.currentGpsLocation = [lat, lng];

                safeMap.updateUserLocationMarker(lat, lng, accuracy, (uLat, uLng) => {
                    this.setGpsAsStartOrigin(uLat, uLng);
                });

                if (panToLocation) {
                    safeMap.centerOnLocation(lat, lng, 15);
                }

                if (autoSetStart) {
                    this.setGpsAsStartOrigin(lat, lng);
                }

                if (gpsBtn) {
                    gpsBtn.classList.remove('locating');
                    gpsBtn.classList.add('tracking-active');
                }
                if (gpsLabel) gpsLabel.innerText = 'Location Set';

                this.showNotification(`📍 Set to ${data.city || 'Trichy'} (${data.source || 'Network/Demo Anchor'}). Click "🎯 Pick on Map" anytime to adjust!`);
                return;
            }
        } catch (err) {
            console.warn('IP location fetch failed:', err);
        }

        // Trichy default fallback
        const fallbackLat = 10.7580, fallbackLng = 78.6475;
        this.currentGpsLocation = [fallbackLat, fallbackLng];
        safeMap.updateUserLocationMarker(fallbackLat, fallbackLng, 300, (uLat, uLng) => {
            this.setGpsAsStartOrigin(uLat, uLng);
        });
        if (panToLocation) safeMap.centerOnLocation(fallbackLat, fallbackLng, 15);
        if (autoSetStart) this.setGpsAsStartOrigin(fallbackLat, fallbackLng);
        if (gpsBtn) gpsBtn.classList.remove('locating');
        if (gpsLabel) gpsLabel.innerText = 'Trichy Anchor';
        this.showNotification('📍 Defaulted to Saranathan College, Trichy. Use "🎯 Pick on Map" to choose your exact origin.');
    }

    setGpsAsStartOrigin(lat, lng) {
        this.customStartCoords = [lat, lng];
        const startSelect = document.getElementById('startNodeSelect');
        if (startSelect) {
            let opt = document.getElementById('optCustomStart');
            if (!opt) {
                opt = document.createElement('option');
                opt.id = 'optCustomStart';
                startSelect.insertBefore(opt, startSelect.firstChild);
            }
            opt.value = '__custom__';
            opt.text = `📍 My Live Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            startSelect.value = '__custom__';
        }
        this.showNotification(`📍 Route Origin set to Live Location: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
        this.fetchRoutes();
    }

    async fetchRoutes(pulseScores = false) {
        const startEl = document.getElementById('startNodeSelect');
        const endEl = document.getElementById('endNodeSelect');

        const startNode = startEl ? startEl.value : 'n_central_bs';
        const endNode = endEl ? endEl.value : 'n_thillai_nagar_main';

        if (startNode === endNode && startNode !== '__custom__') {
            this.showNotification('⚠️ Origin and destination cannot be identical!');
            return;
        }

        const payload = {
            time_mode: this.timeMode,
            end_node: endNode
        };

        if (startNode === '__custom__' && this.customStartCoords) {
            payload.start_node = '__custom__';
            payload.start_coords = this.customStartCoords;
        } else {
            payload.start_node = startNode;
        }

        try {
            const res = await fetch('/api/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.error || !data.success) {
                this.showNotification(`Error: ${data.error || 'Route calculation failed'}`);
                return;
            }

            this.routesData = data.routes;
            this.renderRouteCards(pulseScores);
            this.renderWhyNotFastest();
            this.selectRoute(this.selectedRouteKey);
            this.fetchSafetyStatus();
        } catch (err) {
            console.error('Failed to calculate routes:', err);
            this.showNotification('⚠️ Could not connect to routing server.');
        }
    }

    renderRouteCards(pulseScores = false) {
        const container = document.getElementById('routeCardsContainer');
        if (!container || !this.routesData) return;

        const keys = ['safest', 'balanced', 'fastest'];
        
        container.innerHTML = keys.map(key => {
            const route = this.routesData[key];
            if (!route) return '';
            const isSelected = (key === this.selectedRouteKey);
            const isSafest = (key === 'safest');

            const scoreColor = route.safety_score >= 70 ? '#34d399' : (route.safety_score >= 50 ? '#fbbf24' : '#f87171');
            const conf = route.data_confidence ? route.data_confidence.label : 'High';

            let timeMetricHtml = '';
            if (this.timeMode === 'day') {
                timeMetricHtml = `☀️ High Daylight Visibility`;
            } else if (this.timeMode === 'evening') {
                const litPct = route.metrics ? route.metrics.lighting_pct : 88;
                timeMetricHtml = `🌆 Peak Commute (${litPct}% Lit)`;
            } else {
                const litPct = route.metrics ? route.metrics.lighting_pct : 90;
                timeMetricHtml = `💡 ${litPct}% Light`;
            }

            return `
                <div onclick="window.appController.selectRoute('${key}')" 
                     class="route-card ${isSelected ? 'selected' : ''}">
                    <div class="route-header">
                        <div class="route-title">
                            <span style="color: ${isSafest ? '#34d399' : '#ffffff'};">${route.title}</span>
                            ${isSafest ? '<span class="badge-tag badge-location">RECOMMENDED</span>' : ''}
                        </div>
                        <div style="text-align: right;">
                            <span class="route-score ${pulseScores ? 'score-pulse' : ''}" style="color: ${scoreColor};">
                                ${route.safety_score}%
                            </span>
                            <span style="font-size: 8.5px; display: block; color: #94a3b8; font-weight: 700; text-transform: uppercase;">
                                Calculated Safety
                            </span>
                        </div>
                    </div>

                    <div class="route-footer">
                        <div style="display: flex; gap: 12px; font-weight: 600;">
                            <span>⏱️ ${route.duration_mins} mins</span>
                            <span style="color: #94a3b8;">📏 ${route.distance_km} km</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span style="color: #fbbf24; font-weight: 700; font-size: 11px;">
                                ${timeMetricHtml}
                            </span>
                            <span class="badge-micro badge-conf">${conf}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const activeRoute = this.routesData[this.selectedRouteKey];
        const navStartMeta = document.getElementById('navStartMeta');
        if (navStartMeta && activeRoute) {
            navStartMeta.innerText = `${activeRoute.title} (${activeRoute.safety_score}% Safe • ${activeRoute.duration_mins} mins • ${activeRoute.distance_km} km)`;
        }
    }

    renderWhyNotFastest() {
        const box = document.getElementById('whyNotFastestBox');
        const summaryEl = document.getElementById('wnfSummaryText');
        const reasonsEl = document.getElementById('wnfReasonsList');
        if (!box || !this.routesData) return;

        const wnf = this.routesData.why_not_fastest;
        if (!wnf || wnf.is_same) {
            box.classList.add('hidden');
            return;
        }

        box.classList.remove('hidden');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="wnf-row"><span>⚡</span> <span><strong>Fastest Route:</strong> ${wnf.fastest_duration} mins (${wnf.fastest_score}% calculated safety)</span></div>
                <div class="wnf-row"><span>🛡️</span> <span><strong>Recommended Route:</strong> ${wnf.safest_duration} mins (${wnf.safest_score}% calculated safety)</span></div>
                <div class="wnf-row wnf-trade-off"><span>⏱️</span> <span><strong>Trade-off:</strong> Adds approximately <strong>+${wnf.time_diff_mins} mins (${wnf.distance_diff_m}m)</strong> detour to achieve a <strong>+${wnf.safety_gap_pct}% higher safety score</strong>.</span></div>
            `;
        }

        if (reasonsEl && wnf.reasons) {
            reasonsEl.innerHTML = wnf.reasons.map(r => `
                <li>${r}</li>
            `).join('');
        }
    }

    selectRoute(key) {
        this.selectedRouteKey = key;
        this.renderRouteCards();
        if (this.routesData) {
            safeMap.renderRoutes(this.routesData, key);
            this.updateExplainableAIPanel();
        }
        this.updateNearbySupportPanel();
    }

    getCurrentOriginCoords() {
        if (this.currentWalkerCoord) return this.currentWalkerCoord;
        if (this.customStartCoords) return this.customStartCoords;
        if (this.customStart) return this.customStart;
        if (safeMap.userGpsMarker) {
            const ll = safeMap.userGpsMarker.getLatLng();
            return [ll.lat, ll.lng];
        }
        const startSel = document.getElementById('startNodeSelect');
        if (startSel && this.cityData && this.cityData.nodes) {
            const node = this.cityData.nodes.find(n => n.id === startSel.value);
            if (node) return [node.lat, node.lng];
        }
        return [10.7580, 78.6475]; // Saranathan College default
    }

    getCurrentDestCoords() {
        if (this.customEndCoords) return this.customEndCoords;
        if (this.customEnd) return this.customEnd;
        const endSel = document.getElementById('endNodeSelect');
        if (endSel && this.cityData && this.cityData.nodes) {
            const node = this.cityData.nodes.find(n => n.id === endSel.value);
            if (node) return [node.lat, node.lng];
        }
        return [10.7965, 78.6865]; // Central Bus Stand fallback
    }

    getOriginNodeName() {
        if (this.customStartCoords) return "Live Location";
        const startSel = document.getElementById('startNodeSelect');
        if (startSel && this.cityData && this.cityData.nodes) {
            const node = this.cityData.nodes.find(n => n.id === startSel.value);
            if (node) return node.name;
        }
        return "Route Origin";
    }

    getDestNodeName() {
        if (this.customEndCoords) return "Custom Destination";
        const endSel = document.getElementById('endNodeSelect');
        if (endSel && this.cityData && this.cityData.nodes) {
            const node = this.cityData.nodes.find(n => n.id === endSel.value);
            if (node) return node.name;
        }
        return "Destination";
    }

    getActiveRouteCoordinates() {
        if (this.routesData && this.selectedRouteKey && this.routesData[this.selectedRouteKey]) {
            const route = this.routesData[this.selectedRouteKey];
            if (route.coordinates && route.coordinates.length > 0) {
                return route.coordinates;
            }
        }
        return null;
    }

    getActivePathPolyline() {
        const routeCoords = this.getActiveRouteCoordinates();
        if (routeCoords && routeCoords.length > 0) {
            return routeCoords;
        }
        const orig = this.getCurrentOriginCoords();
        const dest = this.getCurrentDestCoords();
        if (orig && dest) {
            const pts = [];
            const steps = 10;
            for (let i = 0; i <= steps; i++) {
                const f = i / steps;
                pts.push([
                    orig[0] + (dest[0] - orig[0]) * f,
                    orig[1] + (dest[1] - orig[1]) * f
                ]);
            }
            return pts;
        }
        return [orig || [10.7580, 78.6475]];
    }

    getSupportUnitsAlongPath(poiList, maxCorridorDistM = 1200) {
        if (!poiList || poiList.length === 0) return { primary: null, corridorUnits: [] };

        const path = this.getActivePathPolyline();
        const origin = this.getCurrentOriginCoords();
        const currentPos = this.currentWalkerCoord || origin;

        const evaluated = poiList.map(poi => {
            let minDistToPath = Infinity;
            let closestPathPt = null;
            let closestPathIdx = 0;

            for (let i = 0; i < path.length; i++) {
                const pt = path[i];
                const d = safeMap.calculateHaversine(pt[0], pt[1], poi.lat, poi.lng);
                if (d < minDistToPath) {
                    minDistToPath = d;
                    closestPathPt = pt;
                    closestPathIdx = i;
                }
            }

            const distFromUser = safeMap.calculateHaversine(currentPos[0], currentPos[1], poi.lat, poi.lng);
            const distFromOrigin = safeMap.calculateHaversine(origin[0], origin[1], poi.lat, poi.lng);
            const isAlongCorridor = minDistToPath <= maxCorridorDistM;
            const pathProgress = path.length > 1 ? closestPathIdx / (path.length - 1) : 0;

            return {
                item: poi,
                distance_to_path_m: Math.round(minDistToPath),
                distance_from_user_m: Math.round(distFromUser),
                distance_from_origin_m: Math.round(distFromOrigin),
                path_index: closestPathIdx,
                path_progress: pathProgress,
                is_along_corridor: isAlongCorridor
            };
        });

        // Units within corridor distance, ordered from origin to destination along the path
        let corridorUnits = evaluated.filter(e => e.is_along_corridor);
        corridorUnits.sort((a, b) => a.path_index - b.path_index);

        if (corridorUnits.length === 0) {
            const sortedByPathDist = [...evaluated].sort((a, b) => a.distance_to_path_m - b.distance_to_path_m);
            corridorUnits = sortedByPathDist.slice(0, 2);
        }

        // Primary dispatch unit: corridor unit closest to current traveler position along path
        const ranked = [...corridorUnits].sort((a, b) => {
            const scoreA = a.distance_from_user_m + a.distance_to_path_m * 0.4;
            const scoreB = b.distance_from_user_m + b.distance_to_path_m * 0.4;
            return scoreA - scoreB;
        });

        const primary = ranked[0] || null;
        return { primary, corridorUnits };
    }

    updateNearbySupportPanel(customCoords = null) {
        if (!this.cityData) return;

        const polResult = this.getSupportUnitsAlongPath(this.cityData.police_stations, 1200);
        const hospResult = this.getSupportUnitsAlongPath(this.cityData.safe_havens, 1200);
        const liqResult = this.getSupportUnitsAlongPath(this.cityData.liquor_outlets, 800);

        const pol = polResult.primary;
        const hosp = hospResult.primary;
        const liq = liqResult.primary;

        this.cachedNearest = {
            police: pol ? pol.item : null,
            hospital: hosp ? hosp.item : null,
            liquor: liq ? liq.item : null,
            corridorPolice: polResult.corridorUnits,
            corridorHospitals: hospResult.corridorUnits,
            corridorLiquor: liqResult.corridorUnits
        };

        const formatDist = (d) => d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`;

        // 1. Update Police UI (Nearby Tab)
        const polNameEl = document.getElementById('supportPoliceName');
        const polDistEl = document.getElementById('supportPoliceDist');
        const polPhoneEl = document.getElementById('supportPolicePhone');
        if (pol) {
            if (polNameEl) polNameEl.innerText = pol.item.name;
            if (polDistEl) polDistEl.innerText = `${formatDist(pol.distance_from_user_m)} (${formatDist(pol.distance_to_path_m)} from route)`;
            if (polPhoneEl) polPhoneEl.innerText = `📞 ${pol.item.phone}`;
        }

        // 2. Update Hospital UI (Nearby Tab)
        const hospNameEl = document.getElementById('supportHospitalName');
        const hospDistEl = document.getElementById('supportHospitalDist');
        const hospPhoneEl = document.getElementById('supportHospitalPhone');
        if (hosp) {
            if (hospNameEl) hospNameEl.innerText = hosp.item.name;
            if (hospDistEl) hospDistEl.innerText = `${formatDist(hosp.distance_from_user_m)} (${formatDist(hosp.distance_to_path_m)} from route)`;
            if (hospPhoneEl) hospPhoneEl.innerText = `📞 ${hosp.item.phone || '108'}`;
        }

        // 3. Update Liquor UI (Nearby Tab)
        const liqNameEl = document.getElementById('supportLiquorName');
        const liqDistEl = document.getElementById('supportLiquorDist');
        const liqHoursEl = document.getElementById('supportLiquorHours');
        if (liq) {
            if (liqNameEl) liqNameEl.innerText = liq.item.name;
            if (liqDistEl) liqDistEl.innerText = `${formatDist(liq.distance_from_user_m)} (${formatDist(liq.distance_to_path_m)} from route)`;
            if (liqHoursEl) liqHoursEl.innerText = `🕒 ${liq.item.operating_hours || '12:00 PM - 10:00 PM'}`;
        }

        // 4. Update SafeWalk HUD Quick Telemetry
        const navPolEl = document.getElementById('navPoliceQuick');
        const navHospEl = document.getElementById('navHospitalQuick');
        if (navPolEl && pol) {
            const shortName = pol.item.name.replace(/\(.*?\)/g, '').trim();
            navPolEl.innerText = `Police: ${shortName} (${formatDist(pol.distance_from_user_m)})`;
        }
        if (navHospEl && hosp) {
            const shortName = hosp.item.name.replace(/\(.*?\)/g, '').trim();
            navHospEl.innerText = `Hospital: ${shortName} (${formatDist(hosp.distance_from_user_m)})`;
        }

        // 5. Update Emergency Tab Immediate Dispatch Units
        const emPolName = document.getElementById('emergencyPoliceName');
        const emPolDist = document.getElementById('emergencyPoliceDist');
        const emPolLink = document.getElementById('emergencyPolicePhoneLink');
        if (pol) {
            if (emPolName) emPolName.innerText = pol.item.name;
            if (emPolDist) emPolDist.innerText = `Distance: ${formatDist(pol.distance_from_user_m)} • Along route path`;
            if (emPolLink && pol.item.phone) emPolLink.href = `tel:${pol.item.phone.replace(/[^0-9]/g, '')}`;
        }
        const emHospName = document.getElementById('emergencyHospitalName');
        const emHospDist = document.getElementById('emergencyHospitalDist');
        const emHospLink = document.getElementById('emergencyHospitalPhoneLink');
        if (hosp) {
            if (emHospName) emHospName.innerText = hosp.item.name;
            if (emHospDist) emHospDist.innerText = `Distance: ${formatDist(hosp.distance_from_user_m)} • Along route path`;
            if (emHospLink && hosp.item.phone) emHospLink.href = `tel:${hosp.item.phone.replace(/[^0-9]/g, '')}`;
        }

        // 6. Populate Emergency Tab All Corridor Units List
        const emCorridorList = document.getElementById('emergencyCorridorList');
        const emCorridorCount = document.getElementById('emergencyCorridorCount');
        const allCorridorSafety = [];
        polResult.corridorUnits.forEach(u => allCorridorSafety.push({ ...u, type: 'police' }));
        hospResult.corridorUnits.forEach(u => allCorridorSafety.push({ ...u, type: 'hospital' }));
        allCorridorSafety.sort((a, b) => a.path_index - b.path_index);

        if (emCorridorCount) {
            emCorridorCount.innerText = `${allCorridorSafety.length} units along route`;
        }

        if (emCorridorList) {
            if (allCorridorSafety.length === 0) {
                emCorridorList.innerHTML = `<div style="font-size:10px; color:#94a3b8; padding:4px;">No safety units immediately on route corridor.</div>`;
            } else {
                emCorridorList.innerHTML = allCorridorSafety.map(u => {
                    const isPolice = u.type === 'police';
                    const icon = isPolice ? '👮' : '🏥';
                    const badgeClass = isPolice ? 'corridor-badge-police' : 'corridor-badge-hospital';
                    const badgeText = isPolice ? 'POLICE' : 'SAFE HAVEN';
                    const cleanPhone = (u.item.phone || (isPolice ? '112' : '108')).replace(/[^0-9]/g, '');
                    const distLabel = `${formatDist(u.distance_from_user_m)} away (${formatDist(u.distance_to_path_m)} from route)`;

                    return `
                        <div class="corridor-unit-mini-tile">
                            <div class="corridor-unit-info">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <span class="corridor-unit-badge ${badgeClass}">${badgeText}</span>
                                    <span class="corridor-unit-name" title="${u.item.name}">${u.item.name}</span>
                                </div>
                                <span class="corridor-unit-meta">${icon} ${distLabel}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                                <button type="button" class="btn-map-nano" onclick="window.appController.focusPOI('${u.item.id}', ${u.item.lat}, ${u.item.lng}, '${u.item.name.replace(/'/g, "\\'")}')">🗺️ Map</button>
                                <a href="tel:${cleanPhone}" class="btn-call-nano">📞 Call</a>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // 7. Populate Nearby Support Tab Corridor Units List
        const nearbyUnitsList = document.getElementById('nearbyCorridorUnitsList');
        const nearbyUnitsCount = document.getElementById('nearbyCorridorCount');
        if (nearbyUnitsCount) {
            nearbyUnitsCount.innerText = `${allCorridorSafety.length} units along route`;
        }
        if (nearbyUnitsList) {
            if (allCorridorSafety.length === 0) {
                nearbyUnitsList.innerHTML = `<div style="font-size:10px; color:#94a3b8; padding:4px;">No safety units directly on corridor.</div>`;
            } else {
                nearbyUnitsList.innerHTML = allCorridorSafety.map(u => {
                    const isPolice = u.type === 'police';
                    const icon = isPolice ? '👮' : '🏥';
                    const badgeClass = isPolice ? 'corridor-badge-police' : 'corridor-badge-hospital';
                    const badgeText = isPolice ? 'POLICE' : 'SAFE HAVEN';
                    const cleanPhone = (u.item.phone || (isPolice ? '112' : '108')).replace(/[^0-9]/g, '');
                    const distLabel = `${formatDist(u.distance_from_user_m)} from current position • ${formatDist(u.distance_to_path_m)} from route line`;

                    return `
                        <div class="corridor-unit-mini-tile">
                            <div class="corridor-unit-info">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <span class="corridor-unit-badge ${badgeClass}">${badgeText}</span>
                                    <span class="corridor-unit-name" title="${u.item.name}">${u.item.name}</span>
                                </div>
                                <span class="corridor-unit-meta">${icon} ${distLabel}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
                                <button type="button" class="btn-map-nano" onclick="window.appController.focusPOI('${u.item.id}', ${u.item.lat}, ${u.item.lng}, '${u.item.name.replace(/'/g, "\\'")}')">VIEW ON MAP</button>
                                <a href="tel:${cleanPhone}" class="btn-call-nano">📞 CALL</a>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    focusPOI(id, lat, lng, name) {
        if (!safeMap) return;
        safeMap.highlightAndFocusPOI(parseFloat(lat), parseFloat(lng), id);
        this.showNotification(`Focused on route safety unit: ${name}`);
    }

    setCustomCoord(type, lat, lng) {
        if (type === 'start') {
            this.setGpsAsStartOrigin(lat, lng);
        } else if (type === 'end') {
            this.customEndCoords = [lat, lng];
            const endSelect = document.getElementById('endNodeSelect');
            if (endSelect) {
                let opt = document.getElementById('optCustomEnd');
                if (!opt) {
                    opt = document.createElement('option');
                    opt.id = 'optCustomEnd';
                    endSelect.insertBefore(opt, endSelect.firstChild);
                }
                opt.value = '__custom__';
                opt.text = `📍 Custom Destination (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                endSelect.value = '__custom__';
            }
            this.showNotification(`📍 Route Destination set to: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
            this.fetchRoutes();
        }
    }

    focusNearbySupport(type) {
        if (!this.cachedNearest || !this.cachedNearest[type]) {
            this.showNotification('Support location data currently calculating...');
            return;
        }
        const target = this.cachedNearest[type];
        safeMap.highlightAndFocusPOI(target.lat, target.lng, target.id);
        const typeLabels = { police: '👮 Police Station', hospital: '🏥 Safe Haven Hospital', liquor: '🍺 TASMAC / Liquor Retail' };
        this.showNotification(`Focused on nearest ${typeLabels[type] || 'POI'}: ${target.name}`);
    }

    updateExplainableAIPanel() {
        if (!this.routesData) return;
        const exp = this.routesData.ai_explanation;
        const currentRoute = this.routesData[this.selectedRouteKey];
        if (!exp || !currentRoute) return;

        const aiVerdict = document.getElementById('aiVerdict');
        if (aiVerdict) {
            const rawVerdict = exp.verdict || '';
            aiVerdict.innerHTML = rawVerdict.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#34d399; font-weight:700;">$1</strong>');
        }
        
        const factorsList = document.getElementById('aiKeyFactors');
        if (factorsList && exp.key_factors) {
            factorsList.innerHTML = exp.key_factors.map(f => {
                const cleanText = f.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff; font-weight:600;">$1</strong>');
                return `
                    <li>
                        <span class="factor-check-badge">✓</span>
                        <span>${cleanText}</span>
                    </li>
                `;
            }).join('');

            // Contextual environmental factors notice
            if (currentRoute.contextual_factors) {
                const cf = currentRoute.contextual_factors;
                const li = document.createElement('li');
                li.className = "situational-awareness-tile";
                li.innerHTML = `
                    <span style="color:#fbbf24; font-size:13px; line-height:1.2; flex-shrink:0;">ℹ️</span>
                    <span><strong>Situational Awareness:</strong> ${cf.support_facilities_count} verified support facilities (police + safe havens) and ${cf.liquor_outlets_count} licensed retail outlets mapped along perimeter.</span>
                `;
                factorsList.appendChild(li);
            }
        }

        if (currentRoute.metrics) {
            const m = currentRoute.metrics;
            const setBar = (idBar, idVal, val) => {
                const b = document.getElementById(idBar);
                const v = document.getElementById(idVal);
                if (b) b.style.width = `${val}%`;
                if (v) v.innerText = `${val}%`;
            };

            setBar('barLighting', 'valLighting', m.lighting_pct);
            setBar('barCrowd', 'valCrowd', m.crowd_pct);
            setBar('barCCTV', 'valCCTV', m.cctv_pct);
            setBar('barRiskReduction', 'valRiskReduction', m.risk_reduction_pct);
        }

        // Update 8-point scorecard additional indicators & header
        const polProx = document.getElementById('valPoliceProximity');
        const hazOnPath = document.getElementById('valHazardCount');
        const weathFact = document.getElementById('valWeatherFactor');
        const confLvl = document.getElementById('valConfidenceLevel');
        const xaiRouteTitle = document.getElementById('xaiSelectedRouteTitle');

        if (xaiRouteTitle) {
            const titles = {
                safest: 'Safest Route (Recommended)',
                balanced: 'Balanced Route',
                fastest: 'Fastest Route'
            };
            xaiRouteTitle.innerText = `${titles[this.selectedRouteKey] || currentRoute.title} • ${currentRoute.safety_score}% Safety • ${currentRoute.duration_mins} mins (${currentRoute.distance_km} km)`;
        }

        document.querySelectorAll('.route-switch-mini-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.route === this.selectedRouteKey);
        });

        if (polProx) {
            polProx.innerText = (currentRoute.police_distance_m && currentRoute.police_distance_m < 500) ? `High (< ${Math.round(currentRoute.police_distance_m)}m)` : 'Moderate (< 800m)';
        }
        if (hazOnPath) {
            hazOnPath.innerText = (currentRoute.hazards_count !== undefined) ? `${currentRoute.hazards_count} On Corridor` : '0 On Corridor';
        }
        if (weathFact) {
            weathFact.innerText = this.cachedWeatherData ? `${this.cachedWeatherData.condition} (${this.cachedWeatherData.penalty > 0 ? '-' + Math.round(this.cachedWeatherData.penalty * 100) + '%' : '0% Penalty'})` : 'Clear (0% Penalty)';
        }
        if (confLvl) {
            const dc = currentRoute.data_confidence;
            if (dc) {
                confLvl.innerText = dc.label || dc.score_label || (dc.percentage ? `High (${dc.percentage}%)` : 'High (86%)');
            } else {
                confLvl.innerText = 'High (86%)';
            }
        }
    }

    // 🚶 SafeWalk Live Navigation Simulation
    toggleNavigation() {
        const now = Date.now();
        if (this._lastNavToggle && (now - this._lastNavToggle < 400)) {
            return;
        }
        this._lastNavToggle = now;

        const navBtn = document.getElementById('btnStartNav');
        const navPanel = document.getElementById('navActivePanel');
        const devStrip = document.getElementById('deviationAlertStrip');

        if (this.isNavigating) {
            this.isNavigating = false;
            this.isDeviated = false;
            this.lastAnnouncedSafeWalkSegIdx = -1;
            const audioEngine = window.safeAudio || (typeof safeAudio !== 'undefined' ? safeAudio : null);
            if (audioEngine && audioEngine.stopSpeech) {
                audioEngine.stopSpeech();
            }
            safeMap.stopWalkerAnimation();
            safeMap.clearDeviation();
            if (navBtn) {
                navBtn.innerHTML = '🛡️ Start SafeWalk Navigation';
                navBtn.style.background = '#10b981';
            }
            if (navPanel) navPanel.style.display = 'none';
            if (devStrip) {
                devStrip.classList.add('hidden');
                devStrip.style.display = 'none';
            }
            this.showNotification('SafeWalk Navigation Ended.');
        } else {
            const route = this.routesData ? this.routesData[this.selectedRouteKey] : null;
            if (!route || !route.coordinates || route.coordinates.length < 2) {
                this.showNotification('⚠️ Please wait for routes to calculate first.');
                return;
            }

            this.isNavigating = true;
            this.isDeviated = false;
            this.lastAnnouncedSafeWalkSegIdx = -1;
            if (navBtn) {
                navBtn.innerHTML = '⏹️ End SafeWalk Navigation';
                navBtn.style.background = '#dc2626';
            }
            if (navPanel) navPanel.style.display = 'block';
            if (devStrip) {
                devStrip.classList.add('hidden');
                devStrip.style.display = 'none';
            }

            this.showNotification('🚶 Live SafeWalk Navigation Active!');
            const audioEngine = window.safeAudio || (typeof safeAudio !== 'undefined' ? safeAudio : null);
            if (audioEngine && !this.isVoiceMuted) {
                const dest = this.getDestNodeName();
                audioEngine.speakNav(`Starting SafeWalk navigation to ${dest}. Follow the illuminated safe corridor.`, true);
            }

            safeMap.startWalkerAnimation(route.coordinates, (stepIndex, totalSteps, coord, isFinished) => {
                this.currentWalkerCoord = coord;
                this.handleNavigationStep(stepIndex, totalSteps, route, isFinished);
            });
        }
    }

    handleNavigationStep(stepIndex, totalSteps, route, isFinished) {
        const turnInst = document.getElementById('navTurnInstruction');
        const distRem = document.getElementById('navDistanceRemaining');
        const audioEngine = window.safeAudio || (typeof safeAudio !== 'undefined' ? safeAudio : null);

        if (isFinished) {
            if (turnInst) turnInst.innerText = '🎉 Destination Reached Safely in Trichy!';
            if (distRem) distRem.innerText = '0 m';
            this.showNotification('🌟 You have arrived at your destination safely!');
            if (audioEngine && !this.isVoiceMuted) {
                audioEngine.speakNav("You have arrived at your destination safely.", true);
            }
            setTimeout(() => this.toggleNavigation(), 3000);
            return;
        }

        const effectiveTotal = totalSteps || (route.coordinates ? route.coordinates.length : 1);
        const remainingSteps = Math.max(0, effectiveTotal - 1 - stepIndex);
        const remainingDistance = Math.round(route.distance_m * (remainingSteps / Math.max(1, effectiveTotal - 1)));
        
        if (distRem) distRem.innerText = `${remainingDistance} m`;

        if (turnInst) {
            if (stepIndex === 0 && this.customStartCoords) {
                const firstStreet = route.segments?.[0]?.street || 'safe corridor';
                turnInst.innerText = `Departing from your Live Location toward ${firstStreet}`;
            } else if (route.segments && route.segments.length > 0) {
                const segIdx = Math.min(route.segments.length - 1, Math.floor((stepIndex / Math.max(1, effectiveTotal - 1)) * route.segments.length));
                const seg = route.segments[segIdx];
                turnInst.innerText = `Proceed onto ${seg.street} (${seg.lighting}% Illumination)`;

                if (this.lastAnnouncedSafeWalkSegIdx !== segIdx) {
                    this.lastAnnouncedSafeWalkSegIdx = segIdx;
                    if (audioEngine && !this.isVoiceMuted && segIdx > 0) {
                        const turnWord = (segIdx % 2 === 1) ? 'Turn left' : 'Turn right';
                        audioEngine.speakNav(`${turnWord} onto ${seg.street}.`, true);
                    }
                }
            } else {
                turnInst.innerText = 'Continue along safe illuminated corridor';
            }
        }

        // Dynamically update nearest support infrastructure as user walks along route
        if (this.currentWalkerCoord) {
            this.updateNearbySupportPanel(this.currentWalkerCoord);
        }
    }

    // 🔀 Route Deviation Watchdog Simulation
    simulateDeviation() {
        // If navigation is not active, automatically start navigation first so the demo flows smoothly!
        if (!this.isNavigating) {
            this.toggleNavigation();
        }
        if (!this.isNavigating) {
            this.showNotification('⚠️ Please select or calculate a route first.');
            return;
        }

        this.isDeviated = true;

        // Ensure nav active panel is visible
        const navPanel = document.getElementById('navActivePanel');
        if (navPanel) navPanel.style.display = 'block';

        // Unhide deviation alert strip
        const devStrip = document.getElementById('deviationAlertStrip');
        if (devStrip) {
            devStrip.classList.remove('hidden');
            devStrip.style.display = 'flex';
        }

        // Deviate current coordinates into unlit canal zone
        const originCoord = this.currentWalkerCoord || (this.routesData && this.routesData[this.selectedRouteKey]?.coordinates?.[0]) || [10.8010, 78.6880];
        this.currentWalkerCoord = [10.8080, 78.6855]; // Off-route canal area

        // Update nav UI text
        const turnInst = document.getElementById('navTurnInstruction');
        if (turnInst) {
            turnInst.innerHTML = '<span style="color:#f87171; font-weight:800;">⚠️ OFF-CORRIDOR ALERT: Strayed into unlit canal bund (0% light)!</span>';
        }

        const distRem = document.getElementById('navDistanceRemaining');
        if (distRem) distRem.innerText = 'OFF-TRACK';

        // Show prominent deviation trajectory & warning pin on map
        safeMap.showDeviationAlert(originCoord, this.currentWalkerCoord);

        // Audible alert
        if (window.safeAudio && safeAudio.speak) {
            safeAudio.speak("Warning: Route deviation detected! You have left the safe corridor. Recalculate route to return to safety.");
        }

        this.showNotification('⚠️ ROUTE DEVIATION DETECTED! Geofence Watchdog Triggered.');
    }

    async recalculateSafeRoute() {
        const devStrip = document.getElementById('deviationAlertStrip');
        if (devStrip) {
            devStrip.classList.add('hidden');
            devStrip.style.display = 'none';
        }
        this.isDeviated = false;

        safeMap.clearDeviation();

        const endEl = document.getElementById('endNodeSelect');
        const endNode = endEl ? endEl.value : 'n_thillai_nagar_main';
        const currentCoord = this.currentWalkerCoord || [10.8080, 78.6855];

        this.showNotification('🔄 Recalculating safe route from current location...');

        try {
            const res = await fetch('/api/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_coords: currentCoord,
                    end_node: endNode,
                    time_mode: this.timeMode
                })
            });
            const data = await res.json();
            if (data.success && data.routes) {
                this.routesData = data.routes;
                this.renderRouteCards();
                this.renderWhyNotFastest();
                this.selectRoute('safest');
                this.showNotification('🛡️ Safe Route Updated! Guided back to illuminated arterial corridor.');

                if (window.safeAudio && safeAudio.speak) {
                    safeAudio.speak("Safe route recalculated. Rejoining illuminated corridor.");
                }

                // If navigation was active, resume walker animation along the new route
                if (this.isNavigating) {
                    const newRoute = this.routesData['safest'];
                    if (newRoute && newRoute.coordinates && newRoute.coordinates.length > 1) {
                        safeMap.startWalkerAnimation(newRoute.coordinates, (stepIndex, coord, isFinished) => {
                            this.currentWalkerCoord = coord;
                            this.handleNavigationStep(stepIndex, newRoute, isFinished);
                        });
                    }
                }
            }
        } catch(e) {
            console.error("Recalculate error:", e);
            this.showNotification('⚠️ Recalculate failed: ' + e.message);
        }
    }

    // 🚨 Emergency SOS Modal
    async triggerSOSModal() {
        try {
            safeAudio.startSiren();
        } catch(e) {}
        
        const modal = document.getElementById('sosModal');
        if (modal) modal.classList.remove('hidden');

        const coords = this.currentWalkerCoord || this.getCurrentOriginCoords();

        try {
            const res = await fetch('/api/sos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: coords[0],
                    lng: coords[1],
                    user_name: "SafePath Trichy Traveler",
                    route_coords: this.getActiveRouteCoordinates(),
                    origin_name: this.getOriginNodeName(),
                    dest_name: this.getDestNodeName()
                })
            });
            const data = await res.json();

            const polEl = document.getElementById('sosPoliceInfo');
            const hospEl = document.getElementById('sosHospitalInfo');
            const timeEl = document.getElementById('sosTimestamp');
            const detailsEl = document.getElementById('sosDetailsText');

            if (timeEl && data.timestamp) timeEl.innerText = data.timestamp;
            if (polEl && data.nearest_police) {
                polEl.innerText = `${data.nearest_police.name} (${data.nearest_police.distance_m}m away | Helpline: ${data.nearest_police.phone})`;
            }
            if (hospEl && data.nearest_safe_haven) {
                hospEl.innerText = `${data.nearest_safe_haven.name} (${data.nearest_safe_haven.distance_m}m away | Helpline: ${data.nearest_safe_haven.phone})`;
            }
            if (detailsEl && data.sms_payload) {
                detailsEl.innerText = data.sms_payload;
            }
            
            if (navigator.clipboard && data.sms_payload) {
                navigator.clipboard.writeText(data.sms_payload).catch(() => {});
            }
        } catch (e) {
            console.error("SOS error:", e);
        }
    }

    closeSOSModal() {
        try {
            safeAudio.stopSiren();
        } catch(e) {}
        const modal = document.getElementById('sosModal');
        if (modal) modal.classList.add('hidden');
    }

    // ========================================================
    // 📞 Fake Call & Custom Audio Simulation (Dad ❤️ Edition)
    // ========================================================
    initFakeCallSettings() {
        try {
            const saved = localStorage.getItem('safepath_fake_call_v2');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.fakeCallSettings = { ...this.fakeCallSettings, ...parsed };
            }
        } catch(e) {
            console.warn("Could not load fake call settings from localStorage:", e);
        }
        this.updateFakeCallUIElements();
    }

    saveFakeCallSettings() {
        try {
            localStorage.setItem('safepath_fake_call_v2', JSON.stringify(this.fakeCallSettings));
        } catch(e) {
            console.warn("Could not save fake call settings to localStorage:", e);
        }
        this.updateFakeCallUIElements();
    }

    updateFakeCallUIElements() {
        const callerName = this.fakeCallSettings.callerName || "Dad ❤️";
        const callerNumber = this.fakeCallSettings.callerNumber || "Mobile +91 94431-02938";
        const avatar = this.fakeCallSettings.avatar || "👨";
        const hasCustomAudio = !!this.fakeCallSettings.customAudioData;
        const mode = this.fakeCallSettings.audioMode || (hasCustomAudio ? 'custom' : 'ai');

        // 1. Emergency Panel Button Subtitle
        const btnSubtitle = document.getElementById('fakeCallBtnSubtitle');
        if (btnSubtitle) {
            const audioText = (mode === 'custom' && hasCustomAudio) 
                ? `Custom Audio Ready` 
                : "AI Voice Ready";
            btnSubtitle.innerText = `Incoming from ${callerName} (${audioText})`;
        }

        // 2. Incoming Modal
        const inCaller = document.getElementById('fakeCallIncomingCaller');
        if (inCaller) inCaller.innerText = callerName;
        const inNum = document.getElementById('fakeCallIncomingNumber');
        if (inNum) inNum.innerText = callerNumber;
        const inAv = document.getElementById('fakeCallIncomingAvatar');
        if (inAv) inAv.innerText = avatar;

        const inBadge = document.getElementById('fakeCallIncomingAudioBadge');
        const inBadgeText = document.getElementById('fakeCallIncomingAudioText');
        const inBadgeIcon = document.getElementById('fakeCallIncomingAudioIcon');
        if (inBadge && inBadgeText) {
            if (mode === 'custom' && hasCustomAudio) {
                const shortName = this.fakeCallSettings.customAudioName || 'Custom Note';
                inBadgeText.innerText = `Custom Audio: ${shortName.length > 20 ? shortName.substring(0, 18) + '...' : shortName}`;
                if (inBadgeIcon) inBadgeIcon.innerText = "🎙️";
                inBadge.style.color = "#34d399";
                inBadge.style.background = "rgba(52, 211, 153, 0.15)";
                inBadge.style.borderColor = "rgba(52, 211, 153, 0.3)";
            } else {
                inBadgeText.innerText = `${callerName} AI Voice Ready`;
                if (inBadgeIcon) inBadgeIcon.innerText = "🗣️";
                inBadge.style.color = "#93c5fd";
                inBadge.style.background = "rgba(59, 130, 246, 0.15)";
                inBadge.style.borderColor = "rgba(59, 130, 246, 0.3)";
            }
        }

        // 3. Active Modal
        const actCaller = document.getElementById('fakeCallActiveCaller');
        if (actCaller) actCaller.innerText = callerName;
        const actAv = document.getElementById('fakeCallActiveAvatar');
        if (actAv) actAv.innerText = avatar;

        // 4. Config Modal Fields
        const nameInput = document.getElementById('inputFakeCallerName');
        if (nameInput && document.activeElement !== nameInput) nameInput.value = callerName;
        const numInput = document.getElementById('inputFakeCallerNumber');
        if (numInput && document.activeElement !== numInput) numInput.value = callerNumber;

        document.querySelectorAll('.avatar-opt-btn').forEach(btn => {
            if (btn.getAttribute('data-avatar') === avatar) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const cardCustom = document.getElementById('cardAudioModeCustom');
        const cardAI = document.getElementById('cardAudioModeAI');
        const radioCustom = document.getElementById('radioAudioCustom');
        const radioAI = document.getElementById('radioAudioAI');

        if (mode === 'custom') {
            if (cardCustom) cardCustom.classList.add('active');
            if (cardAI) cardAI.classList.remove('active');
            if (radioCustom) radioCustom.checked = true;
        } else {
            if (cardCustom) cardCustom.classList.remove('active');
            if (cardAI) cardAI.classList.add('active');
            if (radioAI) radioAI.checked = true;
        }

        const savedBox = document.getElementById('savedAudioBox');
        const savedTitle = document.getElementById('savedAudioTitle');
        const savedSubtitle = document.getElementById('savedAudioSubtitle');
        const customBadgeState = document.getElementById('customAudioBadgeState');

        if (savedBox) {
            if (hasCustomAudio) {
                savedBox.style.display = 'flex';
                if (savedTitle) savedTitle.innerText = this.fakeCallSettings.customAudioName || "Custom Audio Note";
                if (savedSubtitle) {
                    const dur = this.fakeCallSettings.customAudioDuration ? `~${this.fakeCallSettings.customAudioDuration}s` : "Saved";
                    savedSubtitle.innerText = `Duration: ${dur} (Active in storage)`;
                }
                if (customBadgeState) {
                    customBadgeState.innerText = "READY";
                    customBadgeState.style.color = "#34d399";
                    customBadgeState.style.background = "rgba(52, 211, 153, 0.15)";
                }
            } else {
                savedBox.style.display = 'none';
                if (customBadgeState) {
                    customBadgeState.innerText = "NO AUDIO";
                    customBadgeState.style.color = "#f87171";
                    customBadgeState.style.background = "rgba(239, 68, 68, 0.15)";
                }
            }
        }
    }

    openFakeCallConfigModal() {
        this.updateFakeCallUIElements();
        const modal = document.getElementById('fakeCallConfigModal');
        if (modal) modal.classList.remove('hidden');
    }

    closeFakeCallConfigModal() {
        safeAudio.stopCustomAudio();
        safeAudio.stopSpeech();
        if (this.isRecordingAudio) {
            this.stopMicRecording();
        }
        const modal = document.getElementById('fakeCallConfigModal');
        if (modal) modal.classList.add('hidden');
    }

    async startMicRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showNotification("⚠️ Microphone recording is not supported in this browser.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.recordedAudioChunks = [];
            
            let options = {};
            if (typeof MediaRecorder.isTypeSupported === 'function') {
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    options = { mimeType: 'audio/webm;codecs=opus' };
                } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                    options = { mimeType: 'audio/webm' };
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    options = { mimeType: 'audio/mp4' };
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    options = { mimeType: 'audio/ogg' };
                }
            }

            this.mediaRecorder = new MediaRecorder(stream, options);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.recordedAudioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
                const blob = new Blob(this.recordedAudioChunks, { type: mimeType });
                stream.getTracks().forEach(track => track.stop());

                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result;
                    const duration = this.audioRecordSec || 5;
                    this.fakeCallSettings.customAudioData = dataUrl;
                    this.fakeCallSettings.customAudioName = `Dad_Voice_Recording_${new Date().toLocaleTimeString().replace(/:/g, '-')}.webm`;
                    this.fakeCallSettings.customAudioDuration = duration;
                    this.fakeCallSettings.audioMode = 'custom';
                    this.saveFakeCallSettings();
                    this.showNotification(`🎙️ Custom recording saved successfully (${duration}s)!`);
                };
                reader.readAsDataURL(blob);
            };

            this.mediaRecorder.start(250);
            this.isRecordingAudio = true;
            this.audioRecordSec = 0;

            const startBtn = document.getElementById('btnStartMicRecord');
            const stopBtn = document.getElementById('btnStopMicRecord');
            const timerDisplay = document.getElementById('micTimerDisplay');
            const timerSec = document.getElementById('micTimerSec');
            const statusText = document.getElementById('micStatusText');

            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-flex';
            if (timerDisplay) timerDisplay.style.display = 'inline-flex';
            if (timerSec) timerSec.innerText = "00:00";
            if (statusText) statusText.innerText = "🔴 Recording... Speak Dad's words now";

            if (this.audioRecordTimer) clearInterval(this.audioRecordTimer);
            this.audioRecordTimer = setInterval(() => {
                this.audioRecordSec++;
                const mm = String(Math.floor(this.audioRecordSec / 60)).padStart(2, '0');
                const ss = String(this.audioRecordSec % 60).padStart(2, '0');
                if (timerSec) timerSec.innerText = `${mm}:${ss}`;
                if (this.audioRecordSec >= 60) {
                    this.stopMicRecording();
                }
            }, 1000);

        } catch (err) {
            console.error("Microphone recording error:", err);
            this.showNotification(`⚠️ Microphone access denied: ${err.message || err}`);
        }
    }

    stopMicRecording() {
        if (this.audioRecordTimer) {
            clearInterval(this.audioRecordTimer);
            this.audioRecordTimer = null;
        }

        if (this.mediaRecorder && this.isRecordingAudio) {
            try {
                this.mediaRecorder.stop();
            } catch(e) {}
            this.isRecordingAudio = false;
        }

        const startBtn = document.getElementById('btnStartMicRecord');
        const stopBtn = document.getElementById('btnStopMicRecord');
        const timerDisplay = document.getElementById('micTimerDisplay');
        const statusText = document.getElementById('micStatusText');

        if (startBtn) startBtn.style.display = 'inline-flex';
        if (stopBtn) stopBtn.style.display = 'none';
        if (timerDisplay) timerDisplay.style.display = 'none';
        if (statusText) statusText.innerText = "Recording finished & saved!";
    }

    handleAudioFileUpload(file) {
        if (!file) return;
        if (!file.type.startsWith('audio/')) {
            this.showNotification("⚠️ Please upload a valid audio file (.mp3, .wav, .m4a, .ogg).");
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            this.showNotification("⚠️ File is too large (>8MB). Please choose a shorter audio note.");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            const tempAudio = new Audio(dataUrl);
            tempAudio.onloadedmetadata = () => {
                const duration = Math.round(tempAudio.duration) || 10;
                this.fakeCallSettings.customAudioData = dataUrl;
                this.fakeCallSettings.customAudioName = file.name;
                this.fakeCallSettings.customAudioDuration = duration;
                this.fakeCallSettings.audioMode = 'custom';
                this.saveFakeCallSettings();
                this.showNotification(`✓ Custom audio "${file.name}" (${duration}s) loaded!`);
            };
            tempAudio.onerror = () => {
                this.fakeCallSettings.customAudioData = dataUrl;
                this.fakeCallSettings.customAudioName = file.name;
                this.fakeCallSettings.customAudioDuration = 10;
                this.fakeCallSettings.audioMode = 'custom';
                this.saveFakeCallSettings();
                this.showNotification(`✓ Custom audio "${file.name}" loaded!`);
            };
        };
        reader.readAsDataURL(file);
    }

    deleteSavedCustomAudio() {
        safeAudio.stopCustomAudio();
        this.fakeCallSettings.customAudioData = null;
        this.fakeCallSettings.customAudioName = null;
        this.fakeCallSettings.customAudioDuration = 0;
        this.fakeCallSettings.audioMode = 'ai';
        this.saveFakeCallSettings();
        this.showNotification("🗑️ Custom recording removed. Reverted to Dad's AI voice.");
    }

    triggerFakeCall() {
        this.updateFakeCallUIElements();
        try {
            safeAudio.startRingtone();
        } catch(e) {}
        
        const incModal = document.getElementById('fakeCallIncomingModal');
        const actModal = document.getElementById('fakeCallActiveModal');
        if (incModal) incModal.classList.remove('hidden');
        if (actModal) actModal.classList.add('hidden');
    }

    acceptFakeCall() {
        try {
            safeAudio.stopRingtone();
        } catch(e) {}
        
        const incModal = document.getElementById('fakeCallIncomingModal');
        const actModal = document.getElementById('fakeCallActiveModal');
        if (incModal) incModal.classList.add('hidden');
        if (actModal) actModal.classList.remove('hidden');

        // Start active call timer
        this.callDurationSec = 0;
        const statusEl = document.getElementById('fakeCallStatus');
        if (statusEl) statusEl.innerText = "● 00:01 Connected (Speaker On)";

        if (this.fakeCallTimer) clearInterval(this.fakeCallTimer);
        this.fakeCallTimer = setInterval(() => {
            this.callDurationSec++;
            const mm = String(Math.floor(this.callDurationSec / 60)).padStart(2, '0');
            const ss = String(this.callDurationSec % 60).padStart(2, '0');
            if (statusEl) {
                statusEl.innerText = `● ${mm}:${ss} Connected (Speaker On)`;
            }
        }, 1000);

        const callerName = this.fakeCallSettings.callerName || "Dad ❤️";
        const hasCustomAudio = !!this.fakeCallSettings.customAudioData;
        const mode = this.fakeCallSettings.audioMode || (hasCustomAudio ? 'custom' : 'ai');

        const titleLabel = document.getElementById('fakeCallActiveHeaderTitle');
        const waveAnim = document.getElementById('fakeCallWaveAnimation');
        const scriptText = document.getElementById('fakeCallActiveScriptText');

        if (mode === 'custom' && hasCustomAudio) {
            // 🎙️ PLAY USER'S CUSTOM RECORDING
            if (titleLabel) titleLabel.innerText = `Playing Custom Audio (${this.fakeCallSettings.customAudioName || 'Dad Voice Note'}):`;
            if (waveAnim) waveAnim.style.display = 'inline-flex';
            if (scriptText) {
                scriptText.innerHTML = `
                    <div style="color: #34d399; font-weight: 700; margin-bottom: 4px;">▶️ Playing custom voice recording on speakerphone</div>
                    <div style="font-size: 11px; color: #cbd5e1; line-height: 1.4;">
                        Your recorded custom audio note is playing out loud to deter suspicious individuals. Keep holding your phone and respond naturally.
                    </div>
                `;
            }

            safeAudio.playCustomAudio(this.fakeCallSettings.customAudioData, () => {
                if (waveAnim) waveAnim.style.display = 'none';
                if (titleLabel) titleLabel.innerText = "Line Active (Deterrent Open):";
                if (scriptText) {
                    scriptText.innerHTML = `
                        <div style="color: #34d399; font-weight: 700; margin-bottom: 4px;">✓ Audio note finished</div>
                        <div style="font-size: 11px; color: #cbd5e1; line-height: 1.4;">
                            Line remains connected as an ongoing deterrent. Speak normally into your speakerphone ("Yeah Dad, I'm almost at the signal!").
                        </div>
                    `;
                }
                if (statusEl) {
                    const mm = String(Math.floor(this.callDurationSec / 60)).padStart(2, '0');
                    const ss = String(this.callDurationSec % 60).padStart(2, '0');
                    statusEl.innerText = `● ${mm}:${ss} Line Open (Deterrent Active)`;
                }
            });

        } else {
            // 🗣️ PLAY DAD'S SYNTHESIZED AI VOICE
            if (titleLabel) titleLabel.innerText = `${callerName} AI Dialogue:`;
            if (waveAnim) waveAnim.style.display = 'inline-flex';
            if (scriptText) {
                scriptText.innerText = `"Hey! It's ${callerName.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() || 'Dad'}. I am standing right near the well-lit junction in Thillai Nagar. Where are you? Stay on the main road, I can see the streetlights. Keep walking towards me, I'm waiting outside for you!"`;
            }

            safeAudio.speakCallerScript(() => {
                if (waveAnim) waveAnim.style.display = 'none';
                if (statusEl) {
                    const mm = String(Math.floor(this.callDurationSec / 60)).padStart(2, '0');
                    const ss = String(this.callDurationSec % 60).padStart(2, '0');
                    statusEl.innerText = `● ${mm}:${ss} Line Open (Deterrent Active)`;
                }
            }, callerName);
        }
    }

    closeFakeCall() {
        if (this.fakeCallTimer) {
            clearInterval(this.fakeCallTimer);
            this.fakeCallTimer = null;
        }
        this.callDurationSec = 0;

        try {
            safeAudio.stopAllCallAudio();
        } catch(e) {}
        
        const incModal = document.getElementById('fakeCallIncomingModal');
        const actModal = document.getElementById('fakeCallActiveModal');
        if (incModal) incModal.classList.add('hidden');
        if (actModal) actModal.classList.add('hidden');
        this.showNotification('📞 Fake Call Ended.');
    }

    // 📍 Hazard Reporting
    openHazardModal(lat = 10.8200, lng = 78.6920) {
        this.tempHazardCoords = { lat, lng };
        const modal = document.getElementById('hazardModal');
        const coordText = document.getElementById('hazardCoordText');
        if (modal) modal.classList.remove('hidden');
        if (coordText) coordText.innerText = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)} (Trichy)`;
        
        safeMap.isSelectingLocation = 'hazard';
    }

    openHazardModalWithCoords(lat, lng) {
        this.setHazardFormCoords(lat, lng);
        this.switchTab('report');
        this.showNotification(`📍 Hazard Pin placed at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }

    async submitHazard() {
        const categoryEl = document.getElementById('hazardCategorySelect');
        const descEl = document.getElementById('hazardDescInput');
        const startSel = document.getElementById('startNodeSelect');
        const endSel = document.getElementById('endNodeSelect');

        const category = categoryEl ? categoryEl.value : 'Broken Streetlight';
        const description = (descEl && descEl.value.trim()) ? descEl.value.trim() : 'Reported by Trichy citizen';
        const coords = this.tempHazardCoords || { lat: 10.8200, lng: 78.6920 };

        try {
            const res = await fetch('/api/report-hazard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: coords.lat,
                    lng: coords.lng,
                    category: category,
                    description: description,
                    severity: 0.85,
                    start_node: startSel ? startSel.value : 'n_central_bs',
                    end_node: endSel ? endSel.value : 'n_thillai_nagar_main',
                    time_mode: this.timeMode
                })
            });
            const data = await res.json();
            this.closeHazardModal();
            this.showNotification('✅ Hazard Saved to SQLite! Safety graph recalculated in real time.');
            
            // Reload city layers & re-render routes immediately
            await this.loadCityData();
            if (data.recalculated_routes) {
                this.routesData = data.recalculated_routes;
                this.renderRouteCards();
                this.renderWhyNotFastest();
                this.selectRoute(this.selectedRouteKey);
            } else {
                await this.fetchRoutes();
            }
            this.fetchSafetyStatus();
        } catch (e) {
            console.error("Submit hazard error:", e);
            this.closeHazardModal();
        }
    }

    closeHazardModal() {
        const modal = document.getElementById('hazardModal');
        if (modal) modal.classList.add('hidden');
        safeMap.isSelectingLocation = null;
    }

    // 📋 Data Sources Transparency Modal
    openDataSourcesModal() {
        const modal = document.getElementById('dataSourcesModal');
        if (modal) modal.classList.remove('hidden');
    }

    closeDataSourcesModal() {
        const modal = document.getElementById('dataSourcesModal');
        if (modal) modal.classList.add('hidden');
    }

    // 📲 Safe Journey Link Share
    shareLiveTrip() {
        const startSel = document.getElementById('startNodeSelect');
        const endSel = document.getElementById('endNodeSelect');
        const startName = (startSel && startSel.selectedOptions[0]) ? startSel.selectedOptions[0].text : "Trichy Central";
        const endName = (endSel && endSel.selectedOptions[0]) ? endSel.selectedOptions[0].text : "Thillai Nagar";

        const route = (this.routesData && this.routesData[this.selectedRouteKey]) 
                      ? this.routesData[this.selectedRouteKey] 
                      : { safety_score: 98, duration_mins: 50 };

        const shareText = `🛡️ SafePath AI Safe Journey active in Trichy: Walking from ${startName} to ${endName}. Calculated Safety Score: ${route.safety_score}%, ETA: ${route.duration_mins} mins. Live Tracking: https://safepath.ai/live/trichy-${Date.now().toString().slice(-4)}`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareText).then(() => {
                this.showNotification('📋 Safe Journey tracking link copied to clipboard! (Paste on WhatsApp / SMS)');
            }).catch(() => {
                prompt("Copy Safe Journey link:", shareText);
            });
        } else {
            prompt("Copy Safe Journey link:", shareText);
        }
    }

    // 🗺️ Google Maps Platform Routes API Status
    async checkGoogleMapsStatus() {
        try {
            const res = await fetch('/api/google-maps/status');
            const data = await res.json();
            if (data.configured) {
                console.log('✓ Google Maps Platform Routes API v2 Active: 100% vector spline alignment enabled.');
            }
        } catch (e) {
            console.warn('Google Maps status check skipped:', e);
        }
    }

    showNotification(msg) {
        const toast = document.getElementById('toastNotification');
        if (!toast) return;
        toast.innerText = msg;
        toast.classList.remove('opacity-0', 'pointer-events-none');
        toast.classList.add('opacity-100');
        setTimeout(() => {
            toast.classList.add('opacity-0', 'pointer-events-none');
            toast.classList.remove('opacity-100');
        }, 3500);
    }

    // =========================================================================
    // 🧭 GOOGLE MAPS NAVIGATION CONTROLLER
    // =========================================================================

    calculateGoogleNavManeuvers(coordinates, route) {
        if (!coordinates || coordinates.length < 2) return [];

        const maneuvers = [];
        const totalPoints = coordinates.length;
        const totalDist = route.distance_m || 3000;
        const streetSegments = (route.segments && route.segments.length > 0)
            ? route.segments
            : [
                { street: 'Illuminated Main Arterial', lighting: 92 },
                { street: 'Trichy Safe Corridor', lighting: 88 }
            ];

        // 1. Initial departure maneuver
        const startStreet = streetSegments[0]?.street || 'Safe Corridor';
        maneuvers.push({
            icon: '⬆️',
            instruction: `Head toward ${startStreet}`,
            directionText: 'Head toward',
            road: startStreet,
            distanceM: 0,
            coord: coordinates[0],
            stepRatio: 0,
            announcedAdvance: true,
            announcedTurn: true,
            lighting: streetSegments[0]?.lighting || 90
        });

        // 2. Scan coordinates for meaningful turns (bearing delta >= 18 degrees)
        let lastBearing = safeMap.calculateBearing(
            coordinates[0][0], coordinates[0][1],
            coordinates[1][0], coordinates[1][1]
        );

        let lastTurnIdx = 0;
        const minStepGap = Math.max(2, Math.floor(totalPoints / 16));

        for (let i = 2; i < totalPoints - 1; i++) {
            const p1 = coordinates[i - 1];
            const p2 = coordinates[i];
            const p3 = coordinates[i + 1];

            const b1 = safeMap.calculateBearing(p1[0], p1[1], p2[0], p2[1]);
            const b2 = safeMap.calculateBearing(p2[0], p2[1], p3[0], p3[1]);
            const delta = ((b2 - b1 + 540) % 360) - 180;

            // Turn detected if angular change exceeds 18 degrees and sufficient distance passed
            if (Math.abs(delta) >= 18 && (i - lastTurnIdx) >= minStepGap) {
                let icon = '⬆️';
                let directionText = 'Continue straight';

                if (delta > 18 && delta <= 45) {
                    icon = '↗️';
                    directionText = 'Turn slight right';
                } else if (delta > 45 && delta <= 120) {
                    icon = '➡️';
                    directionText = 'Turn right';
                } else if (delta > 120) {
                    icon = '↪️';
                    directionText = 'Sharp right';
                } else if (delta >= -45 && delta < -18) {
                    icon = '↖️';
                    directionText = 'Turn slight left';
                } else if (delta >= -120 && delta < -45) {
                    icon = '⬅️';
                    directionText = 'Turn left';
                } else if (delta < -120) {
                    icon = '↩️';
                    directionText = 'Sharp left';
                }

                const segIdx = Math.min(streetSegments.length - 1, Math.floor((i / totalPoints) * streetSegments.length));
                const seg = streetSegments[segIdx];
                const streetName = seg ? seg.street : 'Illuminated Avenue';

                const ratio = i / (totalPoints - 1);
                const legDist = Math.round(ratio * totalDist);

                maneuvers.push({
                    icon: icon,
                    instruction: `${directionText} onto ${streetName}`,
                    directionText: directionText,
                    road: streetName,
                    distanceM: legDist,
                    coord: p2,
                    stepRatio: ratio,
                    announcedAdvance: false,
                    announcedTurn: false,
                    lighting: seg ? seg.lighting : 85
                });

                lastTurnIdx = i;
                lastBearing = b2;
            }
        }

        // If route has multiple street segments but few geometry turn points, synthesize maneuvers at segment boundaries
        if (maneuvers.length <= 2 && streetSegments.length > 1) {
            for (let s = 1; s < streetSegments.length; s++) {
                const seg = streetSegments[s];
                const ratio = s / streetSegments.length;
                const turnDist = Math.round(ratio * totalDist);
                const coordIdx = Math.min(totalPoints - 1, Math.floor(ratio * totalPoints));
                const turnDir = (s % 2 === 1) ? 'Turn left' : 'Turn right';
                const icon = (s % 2 === 1) ? '⬅️' : '➡️';

                maneuvers.push({
                    icon: icon,
                    instruction: `${turnDir} onto ${seg.street}`,
                    directionText: turnDir,
                    road: seg.street,
                    distanceM: turnDist,
                    coord: coordinates[coordIdx],
                    stepRatio: ratio,
                    announcedAdvance: false,
                    announcedTurn: false,
                    lighting: seg.lighting || 88
                });
            }
            maneuvers.sort((a, b) => a.stepRatio - b.stepRatio);
        }

        // 3. Final arrival maneuver
        const destName = this.getDestNodeName();
        maneuvers.push({
            icon: '🏁',
            instruction: `Arrive at destination: ${destName}`,
            directionText: 'Arrive at destination',
            road: destName,
            distanceM: totalDist,
            coord: coordinates[totalPoints - 1],
            stepRatio: 1.0,
            announcedAdvance: false,
            announcedTurn: false,
            lighting: 95
        });

        return maneuvers;
    }

    startGoogleNavigation() {
        const route = this.routesData ? this.routesData[this.selectedRouteKey] : null;
        if (!route || !route.coordinates || route.coordinates.length < 2) {
            this.showNotification('⚠️ Please wait for routes to calculate first!');
            return;
        }

        // If SafeWalk navigation was running, stop it
        if (this.isNavigating) {
            this.toggleNavigation();
        }

        this.isGoogleNavigating = true;
        this.navSpeedMultiplier = 1;
        this.isNavPaused = false;
        this.announcedDestApproach = false;
        this.announcedArrival = false;

        // Generate turn-by-turn maneuvers
        this.googleNavManeuvers = this.calculateGoogleNavManeuvers(route.coordinates, route);

        // Populate Steps List Drawer
        this.renderGoogleNavStepsList();

        // Calculate and format ETA
        const now = new Date();
        const etaDate = new Date(now.getTime() + (route.duration_mins || 14) * 60000);
        const hours = etaDate.getHours();
        const minutes = etaDate.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedEta = `${(hours % 12) || 12}:${minutes} ${ampm}`;

        const etaEl = document.getElementById('gNavETA');
        const timeEl = document.getElementById('gNavTimeRemaining');
        const distEl = document.getElementById('gNavDistRemaining');
        const corrEl = document.getElementById('gNavCorridorText');
        const safetyBadge = document.getElementById('gNavSafetyBadge');
        const speedLabel = document.getElementById('gNavSpeedLabel');
        const pauseIcon = document.getElementById('gNavPauseIcon');

        if (etaEl) etaEl.innerText = formattedEta;
        if (timeEl) timeEl.innerText = `${route.duration_mins} min`;
        if (distEl) distEl.innerText = `${(route.distance_m / 1000).toFixed(1)} km`;
        if (speedLabel) speedLabel.innerText = '1x';
        if (pauseIcon) pauseIcon.innerText = '⏸️';

        if (safetyBadge) {
            safetyBadge.innerText = `🛡️ ${route.safety_score}% Safe`;
        }

        if (corrEl) {
            const litPct = route.metrics ? route.metrics.lighting_pct : 90;
            corrEl.innerText = `Illuminated Safe Corridor (${litPct}% Lit)`;
        }

        // Unhide Google Nav Overlays
        const topBanner = document.getElementById('googleNavTopBanner');
        const bottomCard = document.getElementById('googleNavBottomCard');
        const recenterBtn = document.getElementById('btnGNavRecenterFloating');

        if (topBanner) topBanner.classList.remove('hidden');
        if (bottomCard) bottomCard.classList.remove('hidden');
        if (recenterBtn) recenterBtn.classList.add('hidden');

        // Initial Google Maps voice announcement with chime
        const audioEngine = window.safeAudio || (typeof safeAudio !== 'undefined' ? safeAudio : null);
        if (!this.isVoiceMuted && audioEngine) {
            audioEngine._initContext();
            const firstM = this.googleNavManeuvers[0];
            const secondM = this.googleNavManeuvers[1];
            let startPrompt = `Starting navigation to ${this.getDestNodeName()}. Head toward ${firstM ? firstM.road : 'safe corridor'}`;
            if (secondM && secondM.distanceM > 0) {
                startPrompt += `. In ${secondM.distanceM} meters, ${secondM.directionText.toLowerCase()} onto ${secondM.road}`;
            }
            startPrompt += '.';
            audioEngine.speakNav(startPrompt, true);
        }

        this.showNotification('🧭 Google Maps Navigation Started! Following safe corridor.');

        // Start map animation with camera follow & callbacks
        safeMap.startGoogleNavAnimation(
            route.coordinates,
            {
                onCameraBreakFollow: () => {
                    const btn = document.getElementById('btnGNavRecenterFloating');
                    if (btn) btn.classList.remove('hidden');
                },
                onCameraLocked: () => {
                    const btn = document.getElementById('btnGNavRecenterFloating');
                    if (btn) btn.classList.add('hidden');
                }
            },
            (stepIndex, totalSteps, coord, bearing, isFinished) => {
                this.handleGoogleNavStep(stepIndex, totalSteps, coord, bearing, isFinished, route);
            }
        );
    }

    renderGoogleNavStepsList() {
        const listEl = document.getElementById('gNavStepsList');
        const summaryEl = document.getElementById('gNavDrawerSummary');
        const route = this.routesData ? this.routesData[this.selectedRouteKey] : null;

        if (summaryEl && route) {
            summaryEl.innerText = `${(route.distance_m / 1000).toFixed(1)} km • ${route.duration_mins} mins • ${route.safety_score}% Safety`;
        }

        if (!listEl || !this.googleNavManeuvers) return;

        listEl.innerHTML = this.googleNavManeuvers.map((m, idx) => `
            <div class="gnav-step-item ${idx === 0 ? 'active' : ''}" id="gnav-step-row-${idx}">
                <div class="gnav-step-icon">${m.icon}</div>
                <div class="gnav-step-content">
                    <div class="gnav-step-inst">${m.instruction}</div>
                    <div class="gnav-step-meta">
                        <span>${m.distanceM > 0 ? (m.distanceM >= 1000 ? (m.distanceM / 1000).toFixed(1) + ' km' : m.distanceM + ' m') : 'Start'}</span>
                        <span class="gnav-step-chip">💡 ${m.lighting}% Lit</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    handleGoogleNavStep(stepIndex, totalSteps, coord, bearing, isFinished, route) {
        this.currentWalkerCoord = coord;

        const distanceTurnEl = document.getElementById('gNavDistanceToTurn');
        const nextStreetEl = document.getElementById('gNavNextStreet');
        const thenStreetEl = document.getElementById('gNavThenStreet');
        const maneuverIconEl = document.getElementById('gNavManeuverIcon');
        const progressBar = document.getElementById('gNavProgressBar');
        const timeRemEl = document.getElementById('gNavTimeRemaining');
        const distRemEl = document.getElementById('gNavDistRemaining');
        const audioEngine = window.safeAudio || (typeof safeAudio !== 'undefined' ? safeAudio : null);

        const progressRatio = stepIndex / Math.max(1, totalSteps - 1);

        // Update animated progress bar
        if (progressBar) {
            progressBar.style.width = `${Math.min(100, Math.round(progressRatio * 100))}%`;
        }

        // Destination reached state
        if (isFinished) {
            if (distanceTurnEl) distanceTurnEl.innerText = '0 m';
            if (nextStreetEl) nextStreetEl.innerText = `Arrived at ${this.getDestNodeName()}!`;
            if (thenStreetEl) thenStreetEl.innerText = 'You have reached your destination safely.';
            if (maneuverIconEl) maneuverIconEl.innerText = '🎉';
            if (distRemEl) distRemEl.innerText = '0 m';
            if (timeRemEl) timeRemEl.innerText = '0 min';

            if (!this.isVoiceMuted && audioEngine && !this.announcedArrival) {
                this.announcedArrival = true;
                audioEngine.speakNav(`You have arrived at your destination safely. SafePath route complete.`, true);
            }

            this.showNotification('🎉 Destination Reached Safely! Google Navigation Complete.');
            return;
        }

        // Remaining distance & time
        const totalDist = route ? route.distance_m : 3000;
        const totalMins = route ? route.duration_mins : 15;
        const remDistM = Math.max(0, Math.round(totalDist * (1 - progressRatio)));
        const remMins = Math.max(1, Math.round(totalMins * (1 - progressRatio)));

        if (distRemEl) {
            distRemEl.innerText = remDistM >= 1000 ? `${(remDistM / 1000).toFixed(1)} km` : `${remDistM} m`;
        }
        if (timeRemEl) {
            timeRemEl.innerText = `${remMins} min`;
        }

        // Find upcoming maneuver
        if (this.googleNavManeuvers && this.googleNavManeuvers.length > 0) {
            let activeIdx = 0;
            for (let i = 0; i < this.googleNavManeuvers.length; i++) {
                if (this.googleNavManeuvers[i].stepRatio > progressRatio) {
                    activeIdx = i;
                    break;
                }
            }
            if (activeIdx === 0 && this.googleNavManeuvers.length > 1) {
                activeIdx = 1;
            }

            const currentM = this.googleNavManeuvers[activeIdx];
            const nextM = this.googleNavManeuvers[activeIdx + 1];

            // Distance to upcoming maneuver
            const distToManeuver = Math.max(0, Math.round((currentM.stepRatio - progressRatio) * totalDist));

            if (distanceTurnEl) {
                if (distToManeuver <= 35) {
                    distanceTurnEl.innerText = 'Turn now';
                } else if (distToManeuver < 1000) {
                    distanceTurnEl.innerText = `In ${Math.round(distToManeuver / 10) * 10} m`;
                } else {
                    distanceTurnEl.innerText = `In ${(distToManeuver / 1000).toFixed(1)} km`;
                }
            }

            if (nextStreetEl) {
                nextStreetEl.innerText = currentM.instruction;
            }

            if (thenStreetEl) {
                if (nextM && nextM.stepRatio < 1.0) {
                    thenStreetEl.innerText = `Then ${nextM.instruction}`;
                    thenStreetEl.style.display = 'block';
                } else {
                    thenStreetEl.innerText = 'Follow illuminated safe path';
                }
            }

            if (maneuverIconEl) {
                maneuverIconEl.innerText = currentM.icon;
            }

            // Highlight active step in drawer
            document.querySelectorAll('.gnav-step-item').forEach((item, idx) => {
                item.classList.toggle('active', idx === activeIdx);
            });

            // 🔊 Google Maps Turn-By-Turn Audio Voice Announcements
            if (!this.isVoiceMuted && audioEngine) {
                const isArrivalManeuver = (activeIdx === this.googleNavManeuvers.length - 1);

                if (!isArrivalManeuver) {
                    // 1. Advance warning when approaching turn (between 60m and 250m)
                    if (distToManeuver <= 250 && distToManeuver >= 60 && !currentM.announcedAdvance) {
                        currentM.announcedAdvance = true;
                        const distRounded = Math.max(50, Math.round(distToManeuver / 20) * 20);
                        audioEngine.speakNav(`In ${distRounded} meters, ${currentM.instruction}.`, true);
                    }

                    // 2. Action announcement at the turn (under 60m or at/passed maneuver point)
                    if ((distToManeuver < 60 || progressRatio >= currentM.stepRatio) && !currentM.announcedTurn) {
                        currentM.announcedTurn = true;
                        currentM.announcedAdvance = true;
                        let turnVoice = `${currentM.instruction}`;
                        if (nextM && nextM.stepRatio < 1.0) {
                            turnVoice += `, then ${nextM.directionText.toLowerCase()}`;
                        }
                        audioEngine.speakNav(turnVoice, true);
                    }
                } else {
                    // Approaching destination (under 140m)
                    if (distToManeuver <= 140 && distToManeuver >= 30 && !this.announcedDestApproach) {
                        this.announcedDestApproach = true;
                        audioEngine.speakNav(`In 100 meters, you will reach your destination.`, true);
                    }
                }
            }
        }

        // Dynamically update nearest support infrastructure as user traverses corridor
        this.updateNearbySupportPanel(coord);
    }

    stopGoogleNavigation() {
        this.isGoogleNavigating = false;
        safeMap.stopGoogleNavAnimation();

        const audioEngine = window.safeAudio || (typeof safeAudio !== 'undefined' ? safeAudio : null);
        if (audioEngine && audioEngine.stopSpeech) {
            audioEngine.stopSpeech();
        }

        const topBanner = document.getElementById('googleNavTopBanner');
        const bottomCard = document.getElementById('googleNavBottomCard');
        const recenterBtn = document.getElementById('btnGNavRecenterFloating');
        const stepsDrawer = document.getElementById('googleNavStepsDrawer');

        if (topBanner) topBanner.classList.add('hidden');
        if (bottomCard) bottomCard.classList.add('hidden');
        if (recenterBtn) recenterBtn.classList.add('hidden');
        if (stepsDrawer) stepsDrawer.classList.add('hidden');

        this.showNotification('Google Navigation Stopped.');
    }

    cycleNavSpeed() {
        const speeds = [1, 2, 4];
        const currentIdx = speeds.indexOf(this.navSpeedMultiplier);
        const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
        this.navSpeedMultiplier = nextSpeed;

        safeMap.setGoogleNavSpeed(nextSpeed);

        const speedLabel = document.getElementById('gNavSpeedLabel');
        if (speedLabel) speedLabel.innerText = `${nextSpeed}x`;

        this.showNotification(`⏩ Simulation Speed: ${nextSpeed}x`);
    }

    toggleNavPause() {
        const isPaused = safeMap.toggleGoogleNavPause();
        this.isNavPaused = isPaused;

        const pauseIcon = document.getElementById('gNavPauseIcon');
        if (pauseIcon) {
            pauseIcon.innerText = isPaused ? '▶️' : '⏸️';
        }

        this.showNotification(isPaused ? '⏸️ Navigation Paused' : '▶️ Navigation Resumed');
    }

    toggleVoiceMute() {
        this.isVoiceMuted = !this.isVoiceMuted;

        const muteIcon = document.getElementById('gNavMuteIcon');
        if (muteIcon) {
            muteIcon.innerText = this.isVoiceMuted ? '🔇' : '🔊';
        }

        const audioEngine = window.safeAudio || (typeof safeAudio !== 'undefined' ? safeAudio : null);
        if (this.isVoiceMuted) {
            if (audioEngine) audioEngine.stopSpeech();
            this.showNotification('🔇 Voice Guidance Muted');
        } else {
            if (audioEngine) audioEngine.speakNav("Voice guidance active", true);
            this.showNotification('🔊 Voice Guidance Active');
        }
    }

    toggleNavStepsSheet(forceState) {
        const drawer = document.getElementById('googleNavStepsDrawer');
        if (!drawer) return;

        if (forceState !== undefined) {
            if (forceState) drawer.classList.remove('hidden');
            else drawer.classList.add('hidden');
        } else {
            drawer.classList.toggle('hidden');
        }
    }

    recenterNavigation() {
        safeMap.recenterGoogleNavCamera();
        const recenterBtn = document.getElementById('btnGNavRecenterFloating');
        if (recenterBtn) recenterBtn.classList.add('hidden');
        this.showNotification('🎯 Camera re-centered to your navigation position.');
    }
}

// Global initialization
window.appController = new SafePathApp();

window.addEventListener('DOMContentLoaded', () => {
    window.appController.init();
});
