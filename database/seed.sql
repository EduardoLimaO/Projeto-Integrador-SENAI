USE solar_totem;

INSERT INTO stations (name, station_code, location, status)
VALUES ('Totem SENAI - Entrada', 'TOT-001', 'Área central', 'available');

INSERT INTO charging_ports (station_id, port_number, port_code, status)
VALUES
  (1, 1, 'PORT-001', 'available'),
  (1, 2, 'PORT-002', 'occupied'),
  (1, 3, 'PORT-003', 'available'),
  (1, 4, 'PORT-004', 'maintenance');
