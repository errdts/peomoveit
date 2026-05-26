        function togglePanel() {
            const panel = document.getElementById('controlPanel');
            panel.classList.toggle('collapsed');
        }

        window.onload = function() {
            const map = L.map('map', {
                zoomControl: true,
                attributionControl: true
            }).setView([8.5, 124.5], 9);

            let geoJsonLayer; 
            let allRoadData = null;
            let bridgesLayer = null;
            let allBridgesData = null;
            let layerVisibility = {
                provincialRoads: true,
                coreRoads: true,
                provincialBridges: false
            };

            const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            });

            const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri'
            });

            let currentBaseMapLayer = osmLayer.addTo(map);

            document.querySelectorAll('input[name="basemap"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    map.removeLayer(currentBaseMapLayer);
                    if (this.value === 'osm') {
                        currentBaseMapLayer = osmLayer.addTo(map);
                    } else if (this.value === 'satellite') {
                        currentBaseMapLayer = satelliteLayer.addTo(map);
                    }
                    if (window.innerWidth <= 640) {
                        document.getElementById('controlPanel').classList.add('collapsed');
                    }
                });
            });

            async function loadAndDisplayRoads(showCoreOnly = false) {
                try {
                    if (!allRoadData) {
                        // Load map configuration and styles
                        const response = await fetch('map-config-styles.min.js');
                        if (!response.ok) throw new Error('Settings initialization failed.');
                        
                        let configRaw = await response.text();
                        configRaw = configRaw.replace(/\s/g, ''); // Removes any line breaks or spaces

                        try {
                            // Process dynamic configuration string (atob decodes the Base64)
                            const configProcessed = atob(configRaw);
                            allRoadData = JSON.parse(configProcessed);
                        } catch (e) {
                            console.error("Initialization error:", "Configuration format not recognized.");
                            return;
                        }
                    }

                    if (geoJsonLayer) {
                        map.eachLayer(layer => {
                            if (layer.options && layer.options.style &&
                                layer.options.style.opacity === 0 && layer.options.style.weight === 20) {
                                map.removeLayer(layer);
                            }
                        });
                        map.removeLayer(geoJsonLayer);
                    }

                    if (!layerVisibility.provincialRoads && !layerVisibility.coreRoads) {
                        return;
                    }

                    geoJsonLayer = L.geoJson(allRoadData, {
                        filter: function(feature) {
                            const isCore = feature.properties.RR_CORE;

                            // If provincial roads are hidden, show nothing
                            if (!layerVisibility.provincialRoads) {
                                return false;
                            }

                            // If core roads only checkbox is checked, show only core roads
                            if (showCoreOnly) {
                                return isCore === true;
                            }

                            // Otherwise show all roads
                            return true;
                        },
                        style: roadStyle,
                        onEachFeature: function (feature, layer) {
                            layer.bindPopup(roadPopup(feature.properties));

                            if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
                                const sensitivityLayer = L.geoJson(feature, {
                                    style: { weight: 20, opacity: 0, interactive: true }
                                }).addTo(map);

                                sensitivityLayer.on('click', function(e) {
                                    layer.setStyle({
                                        color: '#22c55e',
                                        weight: 5,
                                        opacity: 1
                                    });
                                    layer.openPopup(e.latlng);
                                });

                                sensitivityLayer.on('mouseover', function() {
                                    layer.setStyle({
                                        color: '#22c55e',
                                        weight: 5,
                                        opacity: 1
                                    });
                                });

                                sensitivityLayer.on('mouseout', function() {
                                    layer.setStyle(roadStyle(feature));
                                });

                                layer.on('click', function() {
                                    layer.setStyle({
                                        color: '#22c55e',
                                        weight: 5,
                                        opacity: 1
                                    });
                                });
                            }
                        }
                    }).addTo(map);

                    if (!window.roadsFitBoundsApplied) {
                        map.fitBounds(geoJsonLayer.getBounds());
                        window.roadsFitBoundsApplied = true;
                    }

                } catch (error) {
                    console.error(`Map load error:`, error);
                }
            }

            document.getElementById('coreRoadsToggle').addEventListener('change', function() {
                loadAndDisplayRoads(this.checked);
                // Refresh road names after filter change
                setTimeout(() => {
                    window.populateRoadNames();
                }, 150);
            });

            async function loadAndDisplayBridges(showBridges = false) {
                try {
                    if (!allBridgesData) {
                        const response = await fetch('bridge.geojson');
                        if (!response.ok) throw new Error('Failed to load bridges.');
                        allBridgesData = await response.json();
                    }

                    if (bridgesLayer) {
                        map.removeLayer(bridgesLayer);
                    }

                    if (!showBridges) {
                        return;
                    }

                    bridgesLayer = L.geoJson(allBridgesData, {
                        pointToLayer: function(feature, latlng) {
                            return L.marker(latlng, {
                                icon: L.divIcon({
                                    html: '<div style="width: 16px; height: 16px; background: #0891b2; border: 2px solid #0d7377; box-sizing: border-box; cursor: pointer;"></div>',
                                    iconSize: [16, 16],
                                    className: 'bridge-marker'
                                })
                            });
                        },
                        onEachFeature: function(feature, layer) {
                            layer.bindPopup(bridgePopup(feature.properties));
                        }
                    }).addTo(map);

                } catch (error) {
                    console.error('Bridge load error:', error);
                }
            }

            window.toggleLayerVisibility = function(event) {
                event.preventDefault();
                event.stopPropagation();
                const btn = event.target.closest('button');
                const layer = btn.dataset.layer;
                
                layerVisibility[layer] = !layerVisibility[layer];
                
                // Update eye icon visibility
                const eyeVisible = btn.querySelector('.eye-visible');
                const eyeHidden = btn.querySelector('.eye-hidden');
                if (eyeVisible && eyeHidden) {
                    if (layerVisibility[layer]) {
                        eyeVisible.style.display = 'inline';
                        eyeHidden.style.display = 'none';
                        btn.style.opacity = '1';
                    } else {
                        eyeVisible.style.display = 'none';
                        eyeHidden.style.display = 'inline';
                        btn.style.opacity = '0.6';
                    }
                }
                
                // Reload layers based on visibility
                if (layer === 'provincialRoads') {
                    loadAndDisplayRoads(document.getElementById('coreRoadsToggle').checked);
                } else if (layer === 'provincialBridges') {
                    loadAndDisplayBridges(layerVisibility.provincialBridges);
                }
            };

            // Create and add legend
            const legend = L.control({ position: 'bottomright' });

            legend.onAdd = function (map) {
                const div = L.DomUtil.create('div', 'map-legend');
                div.innerHTML = `
                    <div class="legend-header" onclick="toggleLegend(event)">
                        <h4>Legend</h4>
                        <div class="legend-toggle">
                                                        <!-- Context Menu -->
                            <div id="contextMenu" class="context-menu" style="display: none; position: fixed; z-index: 2000; background: white; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; min-width: 200px;">
                                <button class="context-menu-item" onclick="copyCoordinates()" style="display: block; width: 100%; text-align: left; padding: 10px 16px; border: none; background: none; cursor: pointer; font-size: 14px; color: #333; transition: background 0.2s;">
                                    📋 Copy Coordinates
                                </button>
                                <button class="context-menu-item" onclick="openMapInGoogleMaps()" style="display: block; width: 100%; text-align: left; padding: 10px 16px; border: none; background: none; cursor: pointer; font-size: 14px; color: #333; transition: background 0.2s;">
                                    🗺️ Open in Google Maps
                                </button>
                            </div>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="4" y="3" width="3" height="3" fill="hsl(35, 90%, 60%)" stroke="none"/>
                                <rect x="4" y="10" width="3" height="3" fill="hsl(17.5, 45%, 37.5%)" stroke="none"/>
                                <rect x="4" y="17" width="3" height="3" fill="hsl(0, 0%, 15%)" stroke="none"/>
                                <line x1="9" y1="4.5" x2="20" y2="4.5"/>
                                <line x1="9" y1="11.5" x2="20" y2="11.5"/>
                                <line x1="9" y1="18.5" x2="20" y2="18.5"/>
                            </svg>
                        </div>
                    </div>
                    <div class="legend-content">
                        <div style="font-size: 11px; color: #666; margin-bottom: 10px; line-height: 1.3;">
                            <div style="margin-bottom: 4px; font-weight: 500;">Based on Road Status</div>
                            <div style="font-size: 10px;">Source: PEO 2025 Provincial Road Inventory</div>
                        </div>
                        <div class="legend-item">
                            <div style="background: hsl(35, 90%, 60%);"></div>
                            <span>No Concrete</span>
                        </div>
                        <div class="legend-item">
                            <div style="background: hsl(17.5, 45%, 37.5%);"></div>
                            <span>Partial Concrete</span>
                        </div>
                        <div class="legend-item">
                            <div style="background: hsl(0, 0%, 15%);"></div>
                            <span>Fully Concrete</span>
                        </div>
                        <div style="border-top: 1px solid #ddd; margin-top: 8px; padding-top: 8px;">
                            <div style="font-size: 11px; color: #666; margin-bottom: 6px; font-weight: 500;">Features</div>
                            <div class="legend-item">
                                <div style="width: 14px; height: 14px; background: #0891b2; border: 2px solid #0d7377;"></div>
                                <span>Provincial Bridge</span>
                            </div>
                        </div>
                    </div>
                `;
                L.DomEvent.disableClickPropagation(div);
                return div;
            };

            legend.addTo(map);

            // Toggle legend function - works on all screen sizes
            window.toggleLegend = function(event) {
                event.stopPropagation();
                const legendElement = event.target.closest('.map-legend');
                if (legendElement) {
                    legendElement.classList.toggle('collapsed');
                }
            };

            // Collapse legend on mobile load
            if (window.innerWidth <= 640) {
                const legendDiv = document.querySelector('.map-legend');
                if (legendDiv) {
                    legendDiv.classList.add('collapsed');
                }
            }

            // Initialize layer visibility icons
            setTimeout(() => {
                const btns = document.querySelectorAll('.legend-eye-btn');
                btns.forEach(btn => {
                    const layer = btn.dataset.layer;
                    const eyeVisible = btn.querySelector('.eye-visible');
                    const eyeHidden = btn.querySelector('.eye-hidden');
                    
                    if (!layerVisibility[layer]) {
                        if (eyeVisible && eyeHidden) {
                            eyeVisible.style.display = 'none';
                            eyeHidden.style.display = 'inline';
                        }
                        btn.style.opacity = '0.6';
                    } else {
                        if (eyeVisible && eyeHidden) {
                            eyeVisible.style.display = 'inline';
                            eyeHidden.style.display = 'none';
                        }
                        btn.style.opacity = '1';
                    }
                });
            }, 100);

            function roadStyle(feature) {
                const props = feature.properties;
                const total = parseFloat(props.RR_LENGTH) || 0;
                const conc = parseFloat(props.RL_Conc) || 0;
                const ratio = total > 0 ? Math.min(conc / total, 1) : 0;
                
                const hValue = 35 * (1 - ratio);
                const sValue = 90 * (1 - ratio);
                const lValue = 60 - (ratio * 45); 
                
                return {
                    color: `hsl(${hValue}, ${sValue}%, ${lValue}%)`,
                    weight: 3.5,
                    opacity: 0.95,
                    lineJoin: 'round'
                };
            }

            function roadPopup(props) {
                const lengthVal = props.RR_LENGTH ? parseFloat(props.RR_LENGTH).toFixed(2) : '0.00';
                const formatSegment = (label, val) => {
                    const num = parseFloat(val);
                    if (!num || num === 0) return '';
                    return `<div class="flex justify-between gap-4"><span>${label}:</span> <span class="font-medium text-gray-900">${num.toFixed(2)} km</span></div>`;
                };

                const segments = [
                    formatSegment("Concrete", props.RL_Conc),
                    formatSegment("Gravel", props.RL_Grav),
                    formatSegment("Earth", props.RL_Earth)
                ].filter(s => s !== "").join("");

                return `
                    <div class="min-w-[190px]">
                        <h3 class="text-green-700 font-bold border-b border-green-100 pb-1 mb-2 text-sm">Road Details</h3>
                        <div class="space-y-1 text-gray-700">
                            <div class="leading-tight mb-2">
                                <span class="text-[10px] uppercase font-bold text-gray-400 block tracking-tight">Name</span>
                                <span class="font-bold text-gray-900 leading-none">${props.RR_NAME || 'Unnamed Road'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">Municipality:</span>
                                <span class="font-medium">${props.RR_MUN || 'N/A'}</span>
                            </div>
                            <div class="flex justify-between border-t border-gray-100 pt-1 mt-1 font-bold text-gray-900">
                                <span>Total Length:</span>
                                <span>${lengthVal} km</span>
                            </div>
                            ${segments ? `<div class="mt-2 pt-1 border-t border-dashed border-gray-200 text-xs text-gray-500">${segments}</div>` : ""}
                        </div>
                    </div>
                `;
            }

            function bridgePopup(props) {
                return `
                    <div class="min-w-[200px]">
                        <h3 class="text-cyan-700 font-bold border-b border-cyan-100 pb-1 mb-2 text-sm">Bridge Details</h3>
                        <div class="space-y-1 text-gray-700">
                            <div class="leading-tight mb-2">
                                <span class="text-[10px] uppercase font-bold text-gray-400 block tracking-tight">Name</span>
                                <span class="font-bold text-gray-900 leading-none">${props['newNAME OF BRIDGE'] || 'Unnamed Bridge'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">Municipality:</span>
                                <span class="font-medium">${props['newMUNICIPALITY'] || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            loadAndDisplayRoads(false);

            // Populate road names after initial load
            setTimeout(() => {
                if (allRoadData && allRoadData.features) {
                    window.populateRoadNames();
                    console.log('🔍 Search feature initialized');
                } else {
                    console.warn('⚠ Road data not loaded yet');
                }
            }, 200);

            // Right-click context menu functionality
            let lastClickedCoordinates = null;

            map.on('contextmenu', function(e) {
                e.originalEvent.preventDefault();
                lastClickedCoordinates = {
                    lat: e.latlng.lat.toFixed(6),
                    lng: e.latlng.lng.toFixed(6)
                };

                const contextMenu = document.getElementById('mapContextMenu');
                const coordsDisplay = document.getElementById('coordsDisplay');
                
                // Display coordinates in decimal format
                coordsDisplay.textContent = `${lastClickedCoordinates.lat}, ${lastClickedCoordinates.lng}`;
                
                // Position the context menu at mouse position
                const x = e.originalEvent.pageX;
                const y = e.originalEvent.pageY;
                
                contextMenu.style.display = 'block';
                contextMenu.style.left = x + 'px';
                contextMenu.style.top = y + 'px';

                // Adjust if menu goes off-screen
                setTimeout(() => {
                    const rect = contextMenu.getBoundingClientRect();
                    if (rect.right > window.innerWidth) {
                        contextMenu.style.left = (x - rect.width) + 'px';
                    }
                    if (rect.bottom > window.innerHeight) {
                        contextMenu.style.top = (y - rect.height) + 'px';
                    }
                }, 0);
            });

            // Close context menu on map click
            map.on('click', function() {
                document.getElementById('mapContextMenu').style.display = 'none';
            });

            // Close context menu when clicking outside
            document.addEventListener('click', function(e) {
                const contextMenu = document.getElementById('mapContextMenu');
                if (!contextMenu.contains(e.target)) {
                    contextMenu.style.display = 'none';
                }
            });

            // Coordinate conversion utilities
            window.decimalToDDM = function(decimal, isLat) {
                const d = Math.floor(Math.abs(decimal));
                const m = ((Math.abs(decimal) - d) * 60).toFixed(4);
                const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
                return `${d}° ${m}' ${dir}`;
            };

            window.decimalToDMS = function(decimal, isLat) {
                const d = Math.floor(Math.abs(decimal));
                const tempM = (Math.abs(decimal) - d) * 60;
                const m = Math.floor(tempM);
                const s = ((tempM - m) * 60).toFixed(2);
                const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
                return `${d}° ${m}' ${s}" ${dir}`;
            };

            // Copy functions for different coordinate formats
            window.copyMapCoordinates = function() {
                if (!lastClickedCoordinates) return;
                const text = `${lastClickedCoordinates.lat}, ${lastClickedCoordinates.lng}`;
                navigator.clipboard.writeText(text).then(() => {
                    showNotification('Coordinates copied!');
                    document.getElementById('mapContextMenu').style.display = 'none';
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    alert('Failed to copy coordinates');
                });
            };

            window.openMapInGoogleMaps = function() {
                if (!lastClickedCoordinates) return;
                const url = `https://maps.google.com/?q=${lastClickedCoordinates.lat},${lastClickedCoordinates.lng}`;
                window.open(url, '_blank');
                document.getElementById('mapContextMenu').style.display = 'none';
            };

            window.copyDDMCoordinates = function() {
                if (!lastClickedCoordinates) return;
                const lat = window.decimalToDDM(parseFloat(lastClickedCoordinates.lat), true);
                const lng = window.decimalToDDM(parseFloat(lastClickedCoordinates.lng), false);
                const text = `${lat}, ${lng}`;
                navigator.clipboard.writeText(text).then(() => {
                    showNotification('DDM coordinates copied!');
                    document.getElementById('mapContextMenu').style.display = 'none';
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    alert('Failed to copy coordinates');
                });
            };

            window.copyDMSCoordinates = function() {
                if (!lastClickedCoordinates) return;
                const lat = window.decimalToDMS(parseFloat(lastClickedCoordinates.lat), true);
                const lng = window.decimalToDMS(parseFloat(lastClickedCoordinates.lng), false);
                const text = `${lat}, ${lng}`;
                navigator.clipboard.writeText(text).then(() => {
                    showNotification('DMS coordinates copied!');
                    document.getElementById('mapContextMenu').style.display = 'none';
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    alert('Failed to copy coordinates');
                });
            };

            // Notification helper
            window.showNotification = function(message) {
                const notification = document.createElement('div');
                notification.textContent = message;
                notification.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #15803d;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    z-index: 3000;
                    animation: slideIn 0.3s ease;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                `;
                document.body.appendChild(notification);
                setTimeout(() => {
                    notification.style.animation = 'slideOut 0.3s ease';
                    setTimeout(() => notification.remove(), 300);
                }, 2000);
            };

            // Add slide animations to style
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);

            // Search functionality
            let roadNames = [];
            let roadIndex = {}; // Map road name to feature

            window.populateRoadNames = function() {
                if (!allRoadData || !allRoadData.features) {
                    console.warn('Road data not available for populating names');
                    return;
                }

                roadNames = [];
                roadIndex = {};

                allRoadData.features.forEach(feature => {
                    const name = feature.properties.RR_NAME;
                    if (name && !roadNames.includes(name)) {
                        roadNames.push(name);
                        if (!roadIndex[name]) {
                            roadIndex[name] = feature;
                        }
                    }
                });

                roadNames.sort();
                console.log(`✓ Populated ${roadNames.length} road names`);
            };

            window.clearSearch = function() {
                document.getElementById('searchInput').value = '';
                document.getElementById('searchClearBtn').classList.remove('visible');
                document.getElementById('searchSuggestions').classList.remove('visible');
                document.getElementById('searchSuggestions').innerHTML = '';
            };

            window.parseCoordinates = function(text) {
                const patterns = [
                    /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/,
                    /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/,
                ];

                for (const pattern of patterns) {
                    const match = text.trim().match(pattern);
                    if (match) {
                        const lat = parseFloat(match[1]);
                        const lng = parseFloat(match[2]);
                        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                            return { lat, lng };
                        }
                    }
                }
                return null;
            };

            window.searchRoad = function(query) {
                const searchSuggestions = document.getElementById('searchSuggestions');
                const clearBtn = document.getElementById('searchClearBtn');

                if (!searchSuggestions || !clearBtn) {
                    console.warn('Search elements not found');
                    return;
                }

                if (!query.trim()) {
                    searchSuggestions.classList.remove('visible');
                    clearBtn.classList.remove('visible');
                    return;
                }

                clearBtn.classList.add('visible');
                const queryLower = query.toLowerCase();

                // Check if query is coordinates
                const coords = window.parseCoordinates(query);
                if (coords) {
                    searchSuggestions.innerHTML = `
                        <div class="search-suggestion-label">Coordinates</div>
                        <div class="search-suggestion-item highlighted" onclick="window.goToCoordinates(${coords.lat}, ${coords.lng})">
                            📍 ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}
                        </div>
                    `;
                    searchSuggestions.classList.add('visible');
                    return;
                }

                // Search road names
                const matches = roadNames.filter(name => 
                    name.toLowerCase().includes(queryLower)
                );

                if (matches.length === 0) {
                    searchSuggestions.innerHTML = '<div class="search-no-results">No roads found</div>';
                } else {
                    let html = '<div class="search-suggestion-label">Provincial Roads</div>';
                    matches.slice(0, 15).forEach(name => {
                        const encodedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        html += `<div class="search-suggestion-item" onclick="window.goToRoad('${encodedName}')">${name}</div>`;
                    });
                    searchSuggestions.innerHTML = html;
                }

                searchSuggestions.classList.add('visible');
            };

            window.goToRoad = function(roadName) {
                const feature = roadIndex[roadName];
                if (!feature) {
                    console.warn(`Road not found: ${roadName}`);
                    return;
                }

                try {
                    const layer = L.geoJson(feature);
                    const bounds = layer.getBounds();
                    map.fitBounds(bounds, { padding: [50, 50] });

                    // Highlight the road briefly
                    if (geoJsonLayer) {
                        geoJsonLayer.eachLayer(layer => {
                            const props = layer.feature.properties;
                            const currentName = props.RR_NAME;
                            if (currentName === roadName) {
                                layer.setStyle({
                                    color: '#22c55e',
                                    weight: 6,
                                    opacity: 1
                                });
                                if (layer.openPopup) {
                                    layer.openPopup();
                                }
                                setTimeout(() => {
                                    layer.setStyle(roadStyle(layer.feature));
                                }, 2000);
                            }
                        });
                    }

                    const searchInput = document.getElementById('searchInput');
                    const searchSuggestions = document.getElementById('searchSuggestions');
                    if (searchInput) searchInput.value = roadName;
                    if (searchSuggestions) searchSuggestions.classList.remove('visible');
                    const clearBtn = document.getElementById('searchClearBtn');
                    if (clearBtn) clearBtn.classList.add('visible');
                    showNotification(`Found: ${roadName}`);
                } catch (error) {
                    console.error('Error navigating to road:', error);
                }
            };

            window.goToCoordinates = function(lat, lng) {
                try {
                    map.setView([lat, lng], 16);
                    L.marker([lat, lng], {
                        icon: L.icon({
                            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                            iconSize: [25, 41],
                            shadowSize: [41, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34]
                        })
                    }).addTo(map).bindPopup(`<div class="text-center"><strong>Location</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</div>`).openPopup();

                    const searchInput = document.getElementById('searchInput');
                    const searchSuggestions = document.getElementById('searchSuggestions');
                    if (searchInput) searchInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    if (searchSuggestions) searchSuggestions.classList.remove('visible');
                    const clearBtn = document.getElementById('searchClearBtn');
                    if (clearBtn) clearBtn.classList.add('visible');
                    showNotification(`Navigated to ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                } catch (error) {
                    console.error('Error navigating to coordinates:', error);
                }
            };

            // Search input event listeners
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', function(e) {
                    window.searchRoad(e.target.value);
                });

                searchInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        const query = e.target.value.trim();
                        const coords = window.parseCoordinates(query);
                        if (coords) {
                            window.goToCoordinates(coords.lat, coords.lng);
                        } else {
                            const matches = roadNames.filter(name => 
                                name.toLowerCase().includes(query.toLowerCase())
                            );
                            if (matches.length > 0) {
                                window.goToRoad(matches[0]);
                            }
                        }
                        e.preventDefault();
                    }
                });
            }

            // Close suggestions on outside click
            document.addEventListener('click', function(e) {
                const searchContainer = document.querySelector('.search-container');
                if (searchContainer && !searchContainer.contains(e.target)) {
                    const suggestions = document.getElementById('searchSuggestions');
                    if (suggestions) suggestions.classList.remove('visible');
                }
            });
        };
