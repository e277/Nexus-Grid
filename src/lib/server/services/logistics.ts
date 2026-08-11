/** Business logic for logistics resources: carriers, warehouses, ports, routes. */

import type {
  Carrier,
  Port,
  PortStatus,
  PortType,
  TradeRoute,
  TransportMode,
  Warehouse,
} from "../models";
import { carriers, ports, tradeRoutes, updatePortStatus, warehouses } from "../repositories";
import { NotFoundError } from "./errors";

export interface CarrierInput {
  name: string;
  mode: TransportMode;
  capacity: number | null;
  home_island: string | null;
  contact_email: string | null;
  active: boolean;
}

export interface WarehouseInput {
  name: string;
  island: string;
  capacity: number | null;
  cold_storage: boolean;
}

export interface PortInput {
  name: string;
  island: string;
  port_type: PortType;
}

export interface TradeRouteInput {
  name: string;
  origin_port_id: number;
  destination_port_id: number;
  mode: PortType;
  transit_hours: number | null;
  active: boolean;
}

// Carriers
export function listCarriers(options: {
  skip?: number;
  limit?: number;
  active?: boolean | null;
}): Carrier[] {
  return carriers.list(options);
}

export function getCarrier(carrierId: number): Carrier | null {
  return carriers.get(carrierId);
}

export function createCarrier(input: CarrierInput): Carrier {
  return carriers.create(input);
}

// Warehouses
export function listWarehouses(options: {
  skip?: number;
  limit?: number;
  island?: string | null;
}): Warehouse[] {
  return warehouses.list(options);
}

export function getWarehouse(warehouseId: number): Warehouse | null {
  return warehouses.get(warehouseId);
}

export function createWarehouse(input: WarehouseInput): Warehouse {
  return warehouses.create(input);
}

// Ports
export function listPorts(options: {
  skip?: number;
  limit?: number;
  status?: PortStatus | null;
}): Port[] {
  return ports.list(options);
}

export function getPort(portId: number): Port | null {
  return ports.get(portId);
}

export function createPort(input: PortInput): Port {
  return ports.create({ ...input, status: "open" });
}

export function updateStatus(port: Port, status: PortStatus): Port {
  return updatePortStatus(port, status);
}

// Trade routes
export function listTradeRoutes(options: {
  skip?: number;
  limit?: number;
  active?: boolean | null;
}): TradeRoute[] {
  return tradeRoutes.list(options);
}

export function getTradeRoute(routeId: number): TradeRoute | null {
  return tradeRoutes.get(routeId);
}

export function createTradeRoute(input: TradeRouteInput): TradeRoute {
  for (const portId of [input.origin_port_id, input.destination_port_id]) {
    if (ports.get(portId) === null) {
      throw new NotFoundError(`Port ${portId} does not exist`);
    }
  }
  return tradeRoutes.create(input);
}
