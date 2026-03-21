Velocity Vortex: Technical Specification & Development Plan
Project Overview: A browser-based, high-performance 3D kart racing game replicating the mechanics of N64-era titles while using original, non-infringing assets.
1. Core Technical Stack
To ensure cross-browser compatibility and low-latency multiplayer, the following stack is required:
Graphics Engine: Three.js (WebGL) for 3D rendering.
Physics Engine: Cannon-es (a lightweight, maintained fork of Cannon.js) for vehicle dynamics and collision.
Networking: Geckos.io (WebRTC) to provide UDP-like performance for real-time position syncing.
Language: TypeScript (for type safety in complex physics/network logic).
Build Tool: Vite (for rapid HMR and optimized asset bundling).
2. High-Level Architecture
The game will follow a Client-Authoritative with Server-Validation model.
Client-Side
Physics Interpolation: Smoothly transition between network updates for opponent karts.
Input Prediction: Immediate response for the local player to eliminate perceived lag.
Asset Management: GLTF loader for low-poly models and compressed textures (Basis/KTX2).
Server-Side (Node.js)
Room Management: Handling 4-player lobbies and race starts.
Race Logic: Validating lap times via invisible "gate" checkpoints to prevent cheating.
Item Distribution: Weighted RNG for items based on current rank.
3. Gameplay Mechanics (The "Formula")
The engineer must prioritize "feel" over realistic simulation:
A. The "N64" Drift
Initiation: A small vertical "hop" (impulse) when the drift button is pressed.
Lateral Force: Apply a constant centripetal force while steering during a drift.
Mini-Turbo: A three-stage boost (Blue/Yellow/Red sparks) based on drift duration, applied as a forward impulse upon release.
B. Camera System
Spring Arm: The camera should follow the kart on a "spring," lagging slightly behind during acceleration and swinging wide during drifts to emphasize speed.
4. Asset Guidelines (Clean Room / Non-IP)
To avoid legal issues, the following naming and design conventions must be followed:
Original Reference
Replacement Concept
Mario/Luigi
Stylized Robots or Low-Poly Animals
Red Shell
"Stinger" (Homing Missile)
Green Shell
"Slug" (Dumb-fire Kinetic Projectile)
Banana
"Oil Slick" or "Traction Spike"
Star
"Overdrive" (Invulnerability + Speed)
Rainbow Road
"Prism Highway"

5. Development Roadmap (Milestones)
Phase 1: Engine & Movement
Set up Three.js boilerplate.
Implement Raycast Vehicle physics (4 wheels + suspension).
Deliverable: A drivable "cube" on a flat plane with drifting mechanics.
Phase 2: Track & Environment
Implement a Spline-based track system or custom GLTF tracks.
Add "Invisible Walls" and "Kill Planes" for falling off the track.
Deliverable: A timed solo lap on a themed map.
Phase 3: Networking & Lobbies
Implement WebRTC signaling server.
Sync kart Position/Rotation/Velocity.
Deliverable: Two players can race and see each other moving smoothly.
Phase 4: Combat & Items
Create the "Item Box" trigger volumes.
Implement projectile physics and "hit" states (spinning out).
Deliverable: Full 4-player race with functional weapons and rank-tracking.
6. Performance Targets
Frame Rate: Stable 60 FPS on mid-range mobile/laptop browsers.
Network Latency: < 100ms for smooth play (WebRTC critical).
Initial Load: < 10MB (use Draco compression for 3D models).
Would you like me to expand on the specific networking protocol for the item sync, or perhaps generate a sample README for the GitHub repository?
