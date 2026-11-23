# Basemap Debug & Test Guide

## Issue Summary
The Route Forecast PDF export is not showing basemap colors (blue water, tan land) on the route map visualization. The route line and waypoint markers are showing, but the background colors appear to be missing.

##Current Testing Status

### Changes Made
1. **Added detailed console logging** to track basemap drawing steps
2. **Temporarily using BRIGHT colors** for testing:
   - Bright Blue (#0000FF) for ocean background
   - Bright Red (#FF0000) for land masses
3. **Cache-busted the script** with version parameter (v=4)
4. **Fixed Data Notes text overflow** by reducing lineHeight to 2.6mm

### How to Test

#### Step 1: Verify the Code is Loaded
1. Open http://localhost:8080/route/
2. Open Developer Tools (F12)
3. Go to Console tab
4. You should see logs starting with `[MapCapture]` or `[ExportPDF]`

#### Step 2: Create a Route
1. Click "Generate Route Forecast"
2. Wait for it to complete
3. Check console for any error messages

#### Step 3: Export PDF and Check Console
1. Click "Export PDF"
2. Watch the console output carefully
3. Look for messages like:
   ```
   [MapCapture] Starting basemap drawing to 800x400 canvas
   [MapCapture] fillStyle set to #0000FF (BRIGHT BLUE)
   [MapCapture] Drew BRIGHT BLUE background (0,0,800,400)
   [MapCapture] fillStyle set to #FF0000 (BRIGHT RED)
   [MapCapture] Drew BRIGHT RED rectangle (0,240,240,160)
   [MapCapture] Generated PNG data URL, length: XXXX
   [ExportPDF] Map image received, type: string value exists: true
   [ExportPDF] Adding map image to PDF at position y= XX
   [ExportPDF] Map image added successfully
   ```

#### Step 4: Check the PDF
1. Find the generated PDF in your Downloads folder
2. Look at the Route Map section (should be on page 2 or 3)
3. **If you see BRIGHT BLUE and RED colors** → basemap IS working, just needed verification
4. **If you see NO colors** → there's a rendering issue with jsPDF

### Expected Outcomes

#### Success Scenario
- Console shows all [MapCapture] and [ExportPDF] logs without errors
- PDF displays bright blue background with red land rectangle
- Route line (green) is drawn on top of the colors
- Waypoint markers are visible

#### Failure Scenarios

**Console shows "mapImg is null/undefined"**
- The captureMapImage() function is returning null
- Likely causes: Waypoints not loaded, state.map not available
- Solution: Ensure route forecast was generated successfully

**Console shows drawing logs but PDF is blank**
- Canvas drawing is working, but PNG encoding or jsPDF image embedding has issues
- Likely causes: Canvas/jsPDF incompatibility, PNG corruption during data URL conversion
- Solution: May need to use different image format or canvas options

**Console shows no [MapCapture] logs at all**
- JavaScript file not loaded or cached
- Solution: Hard refresh (Ctrl+Shift+R), clear browser cache, restart server

### Reverting to Professional Colors
Once we confirm the basemap IS rendering:
1. Replace `#0000FF` with `#e8f1f8` (light blue)
2. Replace `#FF0000` with `#f0ede0` (tan)
3. Remove testing console.log statements
4. Commit as "Restore professional basemap colors after verification"

### Additional Debug Steps If Needed

**Extract the PNG from PDF:**
```javascript
// In browser console while viewing generated PDF:
// (May not work due to PDF viewer restrictions, but worth trying)
const canvas = document.querySelector('canvas[data-page-number]');
canvas.toBlob(blob => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'page-capture.png';
  a.click();
});
```

**Test basemap rendering directly:**
Open: http://localhost:8080/test-basemap-simple.html
Click: "Create Test PDF with Basemap"
This creates a minimal test PDF with just the basemap, no route data.

### Next Steps
1. Run the tests above
2. Report which scenario matches your results
3. Share console output screenshot/logs
4. We'll know exactly what's happening and can fix accordingly

---
**Last Updated:** 2026-11-24
**Testing Focus:** Verify basemap colors are being rendered and embedded in PDF
