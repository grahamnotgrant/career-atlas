# Location scenes

The background library contains Overview, Remote and 64 cities. Sixteen have hand-drawn landmarks (New York, Los Angeles, San Diego, Chicago, Miami, Seattle, Dallas, Denver, San Francisco, Austin, Boston, Atlanta, London, Toronto, Paris and Sydney); the rest use a generic skyline seeded from the city id, as does any city added at runtime with the `city` career action (see `CAREER-CONTROL.md`).

## Selection

Selecting a stage or outcome orb keeps the overview and shows where those applications are now. One ribbon runs from the orb to each city holding them, widest for the largest city and capped at eight ribbons; the rest stay listed in the panel. Remote applications ribbon to the satellite beside the globe. Applications that ended at a selected stage drop into their outcome orbs when motion is on. The panel on the right lists companies by location, what happened next and past applications. Hovering a company highlights its city; opening a company opens its record and the selection resumes when the record closes. Selecting an application follows its location automatically; remote roles take precedence over office mentions, and a remote role restricted to a city lights a line from the satellite to that city. Unsupported locations use the manifest's explicit scene or the Overview fallback.

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

## Process display

In Overview and Remote, stage and outcome orbs surround the globe. City scenes use a horizontal stage line above the skyline and outcome totals below. Their positions represent process, never geography. Applied is the cumulative submission count; later stages distinguish current occupancy from historical reach. With a stage selected, the outcome orbs count only that stage's applications. A fourth outcome orb, No reply, shows pending applications silent for 30 days or more; it is derived from dates, the record stays awaiting, and its panel offers the user, and only the user, a way to close them as no reply.

City markers carry two signals. At rest the count's colour is the place's response-rate band against the other places: green above the median, grey for none, plain for the rest or for fewer than three applications. Under a selection the pill fades with the share of that place's applications that have been silent for 30 days or more.

## Globe rendering

The globe stays an SVG orthographic projection. A textured, rotating night-side Earth would need WebGL, which would replace the geometry the accessibility and browser checks are written against and add a rendering dependency to a local tool. Revisit only if the SVG globe becomes the limiting factor for a feature, not for looks alone.

## Geographic assets

The globe uses [World Atlas](https://github.com/topojson/world-atlas), derived from Natural Earth, rendered with [D3's orthographic projection](https://d3js.org/d3-geo/azimuthal). Assets ship locally. See THIRD-PARTY-NOTICES.md for the dependency licenses used by the globe.

## Geographic exploration

The overview globe supports pointer dragging and arrow-key rotation. Visible city markers use real coordinates and application counts. Selecting a city zooms into its scene and filters the process display and application list to that city; this selection persists on refresh. Remote is the satellite beside the globe; opening it filters to remote roles and retains the globe. Only known applied cities receive markers. Stage and outcome selection is part of the shared view state: it persists on refresh and the local API can set it with the `selection` command.

City scenes use a horizontal hiring-stage line above the skyline and outcome totals below. Overview and Remote retain the circular layout around the globe. Selected journey geometry switches with the scene; recorded stages and cohort counts do not change.
