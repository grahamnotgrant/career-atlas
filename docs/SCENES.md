# Location scenes

The background library contains Overview, Remote and 16 cities: New York, Los Angeles, San Diego, Chicago, Miami, Seattle, Dallas, Denver, San Francisco, Austin, Boston, Atlanta, London, Toronto, Paris and Sydney.

## Selection

The Background dropdown contains Overview plus recognized locations in imported applications. Multiple listed offices can contribute multiple options. Search and outcome filters do not change this catalog. Choosing a background does not filter applications. Selecting an application follows its location automatically; remote roles take precedence over office mentions. Unsupported locations use the manifest's explicit scene or the Overview fallback.

## Globe and camera

Overview and Remote show the same shaded Earth, with locally bundled continent geometry. The globe centers on the home city established from resume contact headers. Selecting a city rotates and zooms the globe toward its coordinates, fades through the approach, then performs a short horizontal pan and push-in on local city artwork. City-to-city changes transition directly between city scenes. The application diagram never moves with the camera. Only one scene mounts at a time. New selections interrupt pending transitions. Reduced motion and the pause control remove camera movement.

This is an illustrative transition into vector city artwork, not a continuous satellite map. No map service or geographic network request runs in the browser.

## Home location evidence

The server reads the top contact-header region of the first page of managed resume PDFs. It considers supported city names with regional context, excludes relocation intentions and excludes named employment/education sections. It retains the resume evidence IDs. A conflict, unreadable document, unrecognized city or missing location leaves the center unset. The neutral fallback is not a claim about the user's location. The source-details popup explains the current center.

Home location means the address stated in the resume, not birthplace or a separately verified current residence. Extraction is conservative; scanned PDFs without a text layer need another readable resume. Resume location inference currently supports cities in the scene catalog. Home metadata stays in the private on-disk database and refreshes after dataset imports.

## Add a city

1. Add its stable identifier, label, matching expression and landmark description in `shared/locations.ts`.
2. Add longitude/latitude to `cityCoordinates` for the approach camera.
3. Add original SVG artwork in `src/Scene.tsx`.
4. Add location-resolution fixtures; the browser suite exercises every catalog scene for contrast and rendering.

Avoid ambiguous substring matches and unwarranted geographic assumptions. Aliases are metro-area conveniences for role locations. Unsupported cities remain on the globe rather than acquiring invented scenery. Adding a city to the library does not add it to every user's dropdown.

## Geographic assets

The globe uses [World Atlas](https://github.com/topojson/world-atlas), derived from Natural Earth, rendered with [D3's orthographic projection](https://d3js.org/d3-geo/azimuthal). Assets ship locally. See THIRD-PARTY-NOTICES.md for the dependency licenses used by the globe.

## Geographic exploration

The overview globe supports pointer dragging and arrow-key rotation. Visible city markers use real coordinates and application counts. Selecting a city zooms into its scene and filters the process display and application list to that city; this selection persists on refresh. Remote uses a separate non-geographic control and retains the globe. Only known applied cities receive markers.

City scenes use a horizontal hiring-stage line above the skyline and outcome totals below. Overview and Remote retain the circular layout around the globe. Selected journey geometry switches with the scene; recorded stages and cohort counts do not change.
