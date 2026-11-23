# Testing Guide - Dynamic Vessel Location & Email Scheduling

## Quick Start

### 1. Run Local Server
```bash
cd "C:\Users\bbeamsley\OneDrive - MetService\Documents\Copilot\wxtiles"
python -m http.server 8080
```

Navigate to: `http://localhost:8080/route/index.html`

### 2. Test Dynamic Vessel Location

**Test 1: Manual Input**
1. Draw a route with at least 2 waypoints
2. Enter latitude: `-41.2865`
3. Enter longitude: `174.8860`
4. Click "Update Position & Recalculate"
5. ✓ Red vessel marker should appear on map
6. ✓ Position status should display coordinates

**Test 2: Map Click**
1. Click "Click Map" button
2. Click anywhere on the map
3. ✓ Button text changes to "Click on map..."
4. ✓ Map dragging is disabled
5. ✓ Red vessel marker appears at clicked location
6. ✓ Input fields update with coordinates
7. ✓ Map dragging is re-enabled
8. ✓ Button returns to "Click Map" state

**Test 3: Forecast Recalculation**
1. Draw route
2. Run forecast (should show checkpoints and results)
3. Update vessel position
4. ✓ Forecast recalculates
5. ✓ New forecast data appears (should be from same route, just re-sampled)

**Test 4: Input Validation**
1. Enter invalid latitude (e.g., 95)
2. Click "Update Position & Recalculate"
3. ✓ Alert shows: "Latitude must be between -90 and 90"
4. Enter invalid longitude (e.g., 200)
5. ✓ Alert shows: "Longitude must be between -180 and 180"
6. Leave inputs empty
7. ✓ Alert shows: "Please enter valid latitude and longitude"

### 3. Test Email Scheduling Setup

**Prerequisites:**
- Administrator PowerShell access
- Email account with SMTP access

**Test Steps:**
1. Edit `email_scheduler_config.json`:
   - Set test email credentials
   - Set `"enabled": true`
   - Set test schedule (e.g., 1 minute from now)

2. Run setup script (as Administrator):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\setup_email_scheduler.ps1
   ```

3. Verify task creation:
   ```powershell
   Get-ScheduledTask -TaskName "WxTiles_RouteForecasetEmailScheduler"
   ```

4. Check task history:
   - Open `taskschd.msc`
   - Navigate to: Task Scheduler Library → WxTiles_RouteForecasetEmailScheduler
   - View History tab

5. Check logs:
   ```bash
   tail -f email_scheduler.log
   ```

### 4. Manual Email Scheduler Test

**Without Windows Task Scheduler:**
```bash
cd "C:\Users\bbeamsley\OneDrive - MetService\Documents\Copilot\wxtiles"
python email_scheduler.py
```

This will:
- Read `email_scheduler_config.json`
- Run continuously, checking schedule every minute
- Generate PDFs at configured times
- Email them to recipient
- Log all activity to `email_scheduler.log`

To stop: Press `Ctrl+C`

## Expected Behaviors

### Vessel Location Feature

✓ **Latitude/Longitude Inputs:**
- Accept values with 4 decimal places
- Min/max validation enforced
- Placeholder shows example values
- Accept manual typing or programmatic input

✓ **Position Status Display:**
- Shows "Position: Not set" initially
- Updates to show coordinates after update
- Format: "Position: XX.XXXX, YY.YYYY"

✓ **Map Marker:**
- Red circle with 8px radius
- Shows at correct lat/lng
- Includes popup with coordinates
- Removed when vessel moved
- Stays visible during map interactions

✓ **Click Map Mode:**
- Disables map dragging
- Changes button text to "Click on map..."
- Waits for user to click
- Re-enables dragging after selection
- Returns button to "Click Map" state

✓ **Forecast Recalculation:**
- Uses existing waypoints
- Re-samples weather data
- Updates all forecast data
- Shows progress bar
- Completes in <30 seconds (typical)

### Email Scheduler Feature

✓ **Configuration Loading:**
- Reads JSON config file
- Validates required fields
- Logs errors if config missing
- Supports disabling via "enabled" flag

✓ **Schedule Matching:**
- Checks time every 60 seconds
- Triggers when time matches (within 1 minute window)
- Prevents duplicate runs in same minute
- Respects disabled flag

✓ **PDF Generation:**
- Creates placeholder PDF initially
- Logs that full implementation requires Playwright/Selenium
- Saves to `route_reports/` directory
- Names file with timestamp

✓ **Email Delivery:**
- Connects to SMTP server
- Authenticates with credentials
- Attaches PDF to email
- Includes formatted message body
- Logs success/failure
- Handles SMTP errors gracefully

✓ **Logging:**
- Logs to both console and `email_scheduler.log`
- Includes timestamps
- Shows config details on startup
- Logs each scheduled run attempt
- Includes error messages for troubleshooting

## Browser Console Checks

Open browser Developer Tools (F12) and check:

1. **No JavaScript Errors**
   - Console should be clean
   - Look for red error messages
   - Check Network tab for failed requests

2. **Vessel Location Functions**
   - Type in console: `updateVesselPosition()`
   - Should show validation error or update position
   - Type: `state.vesselLat` - should show current latitude or null

3. **Map Marker**
   - Type: `state.vesselMarker` - should show L.circleMarker object
   - Type: `state.map.removeLayer(state.vesselMarker)` - marker disappears
   - Re-add: Click "Update Position" again

## Troubleshooting During Testing

**UI Controls Not Appearing**
- Check browser console for JavaScript errors
- Verify HTML has correct element IDs
- Reload page (Ctrl+R)
- Check Network tab that all scripts loaded

**Vessel Marker Not Showing**
- Verify coordinates are valid lat/lng
- Check map is zoomed to correct region
- Try zooming out with map controls
- Check browser console for L.circleMarker errors

**Forecast Not Recalculating**
- Verify route has at least 2 waypoints
- Check "Run Forecast" works independently
- Look at progress bar in UI
- Check Network tab for API calls

**Email Not Sending**
- Verify "enabled": true in config
- Test SMTP credentials separately
- Check firewall allows outbound SMTP
- Review `email_scheduler.log` for specific error
- Verify recipient email is valid

**Task Scheduler Issues**
- Run setup script again (as Admin)
- Check task exists: `taskschd.msc`
- View task history for execution status
- Check Application Event Viewer for errors
- Verify Python path hasn't changed

## Test Checklist

- [ ] Vessel location inputs accept valid coordinates
- [ ] Vessel position marker appears on map
- [ ] "Click Map" mode works (map dragging disabled/enabled)
- [ ] Clicking map sets position correctly
- [ ] Position status updates with coordinates
- [ ] Input validation rejects invalid coordinates
- [ ] Forecast recalculates with new position
- [ ] Email scheduler config loads successfully
- [ ] Scheduled tasks can be created in Windows Task Scheduler
- [ ] Email scheduler runs at scheduled times
- [ ] PDFs generated and saved to route_reports/
- [ ] Emails sent successfully (or logged with specific error)
- [ ] No JavaScript errors in browser console
- [ ] All DOM elements (inputs, buttons, status) display correctly

## Performance Notes

- Vessel position update: <100ms (UI update)
- Forecast recalculation: 10-30 seconds (depends on checkpoint count)
- Email sending: 2-5 seconds (SMTP connection + file attachment)
- Scheduler check cycle: 60 seconds (minimal CPU impact)

## Files Modified/Created

**Modified:**
- `route/index.html` - Added vessel location controls
- `route/route.js` - Added vessel location functions and state

**Created:**
- `email_scheduler_config.json` - Scheduler configuration
- `email_scheduler.py` - Scheduler implementation
- `run_email_scheduler.bat` - Windows batch runner
- `setup_email_scheduler.ps1` - Windows Task Scheduler setup
- `VESSEL_LOCATION_AND_EMAIL_GUIDE.md` - Feature documentation
- `TESTING_GUIDE.md` - This file
- `route_reports/` - Directory for generated PDFs (created at runtime)
- `email_scheduler.log` - Scheduler activity log (created at runtime)
