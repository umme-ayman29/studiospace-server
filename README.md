# StudioSpace API

Express and MongoDB backend for StudioSpace, a peer-to-peer creative studio rental platform.

## Features
- JWT authentication stored in HTTPOnly cookies
- Studio CRUD with owner-only update and delete
- Booking system that blocks overlapping confirmed slots
- Host actions to confirm and complete bookings
- Reviews with automatic rating calculation

## Setup
1. Run `npm install`
2. Create a `.env` file with PORT, MONGODB_URI, JWT_SECRET and CLIENT_URL
3. Run `npm run dev`