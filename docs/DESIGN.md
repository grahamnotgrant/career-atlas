# Career Flow visual direction

## Current direction: geographic exploration

September 17, 2026. This supersedes the earlier outcome pools and dense status-ring designs. Stop 1 remains open for visual feedback.

The globe is interactive geography. Drag or use arrow keys to rotate it. City markers show application counts; selecting a marker zooms into the city scene and scopes the process diagram and exploration list to that city's applications. The cohort survives popup navigation and refresh. Back to globe restores the full collection.

Remote appears as a separate “Remote · anywhere” control. It has no invented map coordinate. Remote roles belong to this group even when their description mentions an office. Known multi-office roles can appear under several cities, so city counts need not sum to the overall total. Unknown locations remain in the overall collection.

## Process display

In Overview and Remote, stage and outcome hubs surround the globe. City scenes use a horizontal stage line above the skyline, with active application markers beneath their current stage and compact outcome totals below. City views have no circular status rim. Their positions represent process, never geography. Applied is the cumulative submission count; later stages distinguish current occupancy from historical reach. Awaiting response, rejected and closed are compact counts, with no piles of individual dots. Individual dots remain visible for active interviews and offers, or a selected application.

No connection lines appear at rest. Clicking a stage or outcome reveals counted direct connections; selecting an application reveals its recorded path. Hover and focus can show summaries. Unknown interview stages remain explicit and never imply a more specific stage.

## Exploration and motion

Search, application details and evidence open in a floating popup. Back restores popup history; Close returns to the scene. Keyboard focus stays inside an open popup and returns to its invoking control. Search supports slash and Command/Control-K.

Overview and Remote use a globe centered on resume contact-header evidence when available. City transitions approach the geographic destination before revealing the city artwork. Reduced motion is supported. Source additions update through server-sent events and preserve the selected city cohort.

## Verification boundary

The current revision passes 41 unit/integration tests and 14 browser tests in isolated desktop Chromium, including city selection, scoped counts, popup navigation, refresh, globe rotation, Remote, reduced motion, accessibility and source additions. The Codex embedded renderer has not been independently tested. Dense nearby city label placement and large-cohort performance still need evaluation before release. Private historical reconciliation remains separate from this visual milestone.
