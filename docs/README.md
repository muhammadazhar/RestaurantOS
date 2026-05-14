# RestaurantOS Documentation Pack

Version: 1.0  
Date: 2026-05-14  
System: RestaurantOS SaaS Restaurant Management Platform

## Purpose

This documentation pack provides business, QA, operations, and technical teams with a shared reference for validating, operating, and understanding RestaurantOS.

## Documents

| Document | Audience | Purpose |
|---|---|---|
| [UAT Plan](./UAT_PLAN.md) | Product owners, QA, business users | Defines acceptance scope, roles, scenarios, test cases, and sign-off criteria. |
| [User Manual](./USER_MANUAL.md) | Restaurant staff, managers, super admins | Explains how to use RestaurantOS day to day. |
| [Flow Diagrams](./FLOW_DIAGRAMS.md) | Product, QA, operations, support | Shows business process flows across major modules. |
| [Sequence Diagrams](./SEQUENCE_DIAGRAMS.md) | Developers, QA, architects | Shows request and sync sequences for key system interactions. |
| [System Architecture](./SYSTEM_ARCHITECTURE.md) | Engineering, DevOps, security, support | Describes architecture, components, data stores, deployment modes, and integration points. |

## Microsoft Word Versions

Microsoft Word `.docx` copies are available in `docs/word/`.

| Word File | Purpose |
|---|---|
| `docs/word/RestaurantOS_Documentation_Pack.docx` | Combined documentation pack in one Word file. |
| `docs/word/readme.docx` | Documentation index. |
| `docs/word/uat_plan.docx` | UAT plan. |
| `docs/word/user_manual.docx` | User manual. |
| `docs/word/flow_diagrams.docx` | Flow diagrams document. |
| `docs/word/sequence_diagrams.docx` | Sequence diagrams document. |
| `docs/word/system_architecture.docx` | System architecture document. |

## System Summary

RestaurantOS is a multi-tenant restaurant management platform with:

- POS and order lifecycle management.
- Kitchen display and table operations.
- Inventory, recipes, and menu management.
- Staff, attendance, shifts, and roles.
- Rider delivery, phone orders, collections, and incentives.
- Reports, refunds, general ledger, and subscription management.
- Online/cloud operation with Neon PostgreSQL.
- Local offline-server operation with PostgreSQL and sync queue.
- Super admin management for restaurants, groups, subscriptions, pricing, and support.

## Important Environment Notes

- Local offline app: `http://localhost:5051`
- Local online/cloud test app: `http://localhost:5052`
- Railway deployment is intentionally not pushed while the Railway subscription is expired.
- Runtime secrets and environment-specific values must remain outside Git, especially `backend/.env`.
