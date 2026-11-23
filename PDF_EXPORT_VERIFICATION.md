# PDF Export Verification Checklist

## Summary of Fixes Applied

### ✅ Basemap Colors - VERIFIED WORKING
- Changed from bright blue/red back to professional colors:
  - Light blue (#e8f1f8) for ocean water
  - Tan (#f0ede0) for land masses
- Status: **Basemap is rendering correctly in PDF**

### ✅ Data Notes Text Overflow - FIXED
- Reduced font size from 7pt to 6.5pt
- Reduced line height from 2.6mm to 2.3mm
- Increased padding calculations with +1mm safety margin
- Status: **All text should now fit in box**

---

## How to Test (Step by Step)

### Step 1: Refresh Browser
```
Ctrl + Shift + R  (Hard refresh to clear cache)
```
Wait for page to fully load.

### Step 2: Generate Route Forecast
1. Click "Generate Route Forecast" button
2. Wait for completion (should see forecast data displayed)
3. Watch console (F12) for any errors

### Step 3: Export PDF
1. Click "Export PDF" button
2. Wait for download notification
3. Open the PDF from Downloads folder

### Step 4: Verify Map Section
Look at the **Route Map** section:
- ✅ Should have **light blue background** (ocean)
- ✅ Should have **tan/beige rectangle** in lower-left (land)
- ✅ Should have **green line** showing route path
- ✅ Should have **colored circles** showing waypoints (blue=start, yellow/orange=middle, red=end)

### Step 5: Verify Data Notes Section
Look at the **DATA NOTES & QUALITY INFORMATION** box:
- ✅ Title text should be clearly visible
- ✅ Main note (starting with "Wave and wind data sourced...")
  - Should show MULTIPLE lines of text
  - Should wrap properly
  - Should NOT extend outside the box
- ✅ Simulated data note (starting with "⚠ Some checkpoints...")
  - Should appear BELOW the main note
  - Should wrap properly
  - Should NOT extend outside the box
- ✅ ALL text should be visible inside the orange-bordered box

---

## Expected Visual Result

```
╔════════════════════════════════════════════════════════════╗
║          DATA NOTES & QUALITY INFORMATION                  ║
║                                                             ║
║ Wave and wind data sourced from MetOcean WxTiles API.      ║
║ Forecasts are model-derived estimates and should not be    ║
║ used as the sole navigational authority. Always cross-     ║
║ reference with official maritime forecasts and warnings    ║
║ from MetService New Zealand.                               ║
║                                                             ║
║ ⚠ Some checkpoints used synthetic/interpolated data        ║
║ because real tile data was unavailable at those positions  ║
║ (marked ⚠syn in table).                                     ║
║                                                             ║
╚════════════════════════════════════════════════════════════╝
```

---

## Troubleshooting

### Issue: No basemap colors (only white background)
- **Check:** Did you do a hard refresh? (Ctrl+Shift+R)
- **Check:** Console should show `[MapCapture]` logs
- **Fix:** Clear browser cache completely, restart server, try again

### Issue: Text still doesn't fit
- **Check:** Console should show `[DataNotes]` with box height calculation
- **Look:** How many lines are in mainNoteLines and simNoteLines?
- **Action:** Report the console output for further adjustment

### Issue: Page is blank or error
- **Check:** Browser console for errors (F12)
- **Check:** Did route forecast generate successfully?
- **Action:** Report any error messages in console

---

## Console Debug Output

When exporting PDF, you should see logs like:

```
[MapCapture] Starting basemap drawing to 800x400 canvas
[MapCapture] fillStyle set to #e8f1f8 (light blue)
[MapCapture] Drew light blue background (0,0,800,400)
[MapCapture] fillStyle set to #f0ede0 (tan land)
[MapCapture] Drew tan land rectangle (0,240,240,160)
...
[MapCapture] Generated PNG data URL, length: 12345
[ExportPDF] Map image received, type: string value exists: true
[ExportPDF] Adding map image to PDF at position y= 85
[ExportPDF] Map image added successfully
...
[DataNotes] mainNoteLines: 4 simNoteLines: 2
[DataNotes] Box height: 42.3 (top: 8 + main: 10.9 + space: 2 + sim: 6.3 + bottom: 5)
```

---

## Quick Report Template

If issues persist, please report:

```
✅ Basemap colors:  [YES/NO - describe what you see]
✅ Map elements:    [Route line, waypoints all visible? YES/NO]
✅ Data Notes fits: [All text in box? YES/NO]
❌ Issues:          [Description]
📋 Console output:  [Any errors or unexpected logs?]
```

---

**Last Updated:** 2026-11-24  
**Version:** v5 (cache-bust parameter)
