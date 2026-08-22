import React, { useEffect, useRef, useState } from 'react';

const YANDEX_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY || '';
const MOSCOW_CENTER = [55.751574, 37.573856]; // Москва центр

export const TaskMap = ({ tasks, onTaskClick, selectedTaskId }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markers = useRef([]);
    const [mapReady, setMapReady] = useState(false);

    useEffect(() => {
        // Load Yandex Maps API
        if (!window.ymaps) {
            const script = document.createElement('script');
            script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU`;
            script.async = true;
            script.onload = () => {
                window.ymaps.ready(() => {
                    initMap();
                });
            };
            document.head.appendChild(script);
        } else if (window.ymaps) {
            window.ymaps.ready(() => {
                initMap();
            });
        }

        return () => {
            if (mapInstance.current) {
                mapInstance.current.destroy();
                mapInstance.current = null;
            }
        };
    }, []);

    const initMap = () => {
        if (!mapRef.current || mapInstance.current) return;

        mapInstance.current = new window.ymaps.Map(mapRef.current, {
            center: MOSCOW_CENTER,
            zoom: 11,
            controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
        });

        setMapReady(true);
    };

    useEffect(() => {
        if (!mapReady || !mapInstance.current) return;

        // Clear old markers
        markers.current.forEach(marker => {
            mapInstance.current.geoObjects.remove(marker);
        });
        markers.current = [];

        // Add markers for tasks with location
        const tasksWithLocation = tasks.filter(t =>
            t.latitude && t.longitude && !t.is_remote
        );

        if (tasksWithLocation.length === 0) {
            // No tasks with location, stay centered on Moscow
            return;
        }

        tasksWithLocation.forEach(task => {
            const placemark = new window.ymaps.Placemark(
                [task.latitude, task.longitude],
                {
                    balloonContentHeader: task.title,
                    balloonContentBody: `
                        <div style="max-width: 250px;">
                            <p style="margin: 8px 0; color: #059669; font-weight: bold; font-size: 16px;">
                                ${task.budget} ₽
                            </p>
                            <p style="margin: 8px 0; color: #6b7280; font-size: 14px;">
                                ${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}
                            </p>
                            <button
                                onclick="window.openTaskFromMap(${task.id})"
                                style="
                                    background: #2563eb;
                                    color: white;
                                    padding: 8px 16px;
                                    border: none;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-weight: 500;
                                    margin-top: 8px;
                                "
                            >
                                Подробнее
                            </button>
                        </div>
                    `,
                    balloonContentFooter: task.city
                },
                {
                    preset: task.id === selectedTaskId
                        ? 'islands#greenDotIcon'
                        : 'islands#blueDotIcon',
                    iconColor: task.status === 'open' ? '#2563eb' : '#6b7280'
                }
            );

            markers.current.push(placemark);
            mapInstance.current.geoObjects.add(placemark);
        });

        // Fit bounds to show all markers
        if (tasksWithLocation.length > 0) {
            const bounds = mapInstance.current.geoObjects.getBounds();
            if (bounds) {
                mapInstance.current.setBounds(bounds, {
                    checkZoomRange: true,
                    zoomMargin: 50
                });
            }
        }

        // Setup click handler
        window.openTaskFromMap = (taskId) => {
            if (onTaskClick) {
                onTaskClick(taskId);
            }
        };

    }, [tasks, mapReady, selectedTaskId, onTaskClick]);

    return (
        <div className="w-full h-full relative">
            <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden border border-gray-200" />
            {!mapReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
                    <div className="text-center">
                        <div className="text-4xl mb-2 animate-pulse">🗺️</div>
                        <p className="text-gray-600">Загрузка карты...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export const LocationPicker = ({ initialLocation, onLocationSelect, city = 'Москва' }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const marker = useRef(null);
    const [mapReady, setMapReady] = useState(false);

    // City coordinates
    const cityCoords = {
        'Москва': [55.751574, 37.573856],
        'Санкт-Петербург': [59.9343, 30.3351],
        'Новосибирск': [55.0084, 82.9357],
        'Екатеринбург': [56.8389, 60.6057],
        'Казань': [55.8304, 49.0661],
    };

    useEffect(() => {
        if (!window.ymaps) {
            const script = document.createElement('script');
            script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU`;
            script.async = true;
            script.onload = () => {
                window.ymaps.ready(() => initMap());
            };
            document.head.appendChild(script);
        } else {
            window.ymaps.ready(() => initMap());
        }

        return () => {
            if (mapInstance.current) {
                mapInstance.current.destroy();
            }
        };
    }, []);

    const initMap = () => {
        if (!mapRef.current || mapInstance.current) return;

        const center = initialLocation || cityCoords[city] || MOSCOW_CENTER;

        mapInstance.current = new window.ymaps.Map(mapRef.current, {
            center,
            zoom: 13,
            controls: ['zoomControl', 'geolocationControl']
        });

        // Click to set location
        mapInstance.current.events.add('click', (e) => {
            const coords = e.get('coords');
            setMarker(coords);
            if (onLocationSelect) {
                onLocationSelect(coords);
            }
        });

        if (initialLocation) {
            setMarker(initialLocation);
        }

        setMapReady(true);
    };

    const setMarker = (coords) => {
        if (marker.current) {
            mapInstance.current.geoObjects.remove(marker.current);
        }

        marker.current = new window.ymaps.Placemark(coords, {
            balloonContent: 'Место выполнения задачи'
        }, {
            preset: 'islands#redDotIcon',
            draggable: true
        });

        marker.current.events.add('dragend', () => {
            const newCoords = marker.current.geometry.getCoordinates();
            if (onLocationSelect) {
                onLocationSelect(newCoords);
            }
        });

        mapInstance.current.geoObjects.add(marker.current);
    };

    return (
        <div className="w-full h-64 relative">
            <div ref={mapRef} className="w-full h-full rounded-lg overflow-hidden border border-gray-300" />
            {!mapReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                    <p className="text-gray-600">Загрузка карты...</p>
                </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Кликните на карту, чтобы указать место выполнения</p>
        </div>
    );
};
