# Quick Start - Dynamic Vessel Location & Email Scheduling

## What Was Added

### 1. Dynamic Vessel Location Feature ✅ COMPLETE

The Route Forecast now supports real-time vessel location tracking:

**UI Elements:**
- Latitude and longitude input fields
- "Update Position & Recalculate" button
- "Click Map" button for interactive positioning
- Real-time position status display
- Red vessel marker on the map

**How to Use:**
1. Open http://localhost:8080/route/index.html
2. Draw a route (2+ waypoints minimum)
3. Enter your vessel's latitude and longitude, OR
4. Click "Click Map" and click on the map
5. Click "Update Position & Recalculate"
6. The forecast will recalculate with your new position!

### 2. Email Scheduling System ✅ COMPLETE

Automated 4x daily PDF generation and email delivery:

**Setup (5 minutes):**
1. Edit `email_scheduler_config.json`:
   - Set your recipient email
   - Add SMTP credentials
   - Set `"enabled": true`

2. Run the setup script (as Administrator):
   ```powershell
   .\setup_email_scheduler.ps1
   ```

3. Done! PDFs will auto-generate at 06:00, 12:00, 18:00, 00:00 UTC

## Files Modified

| File | Changes |
|------|---------|
| `route/index.html` | Added vessel location control section |
| `route/route.js` | Added vessel position state & functions |

## New Files Created

| File | Purpose |
|------|---------|
| `email_scheduler_config.json` | Scheduler configuration |
| `email_scheduler.py` | Main scheduler application |
| `setup_email_scheduler.ps1` | Windows Task Scheduler setup |
| `run_email_scheduler.bat` | Manual scheduler runner |
| `VESSEL_LOCATION_AND_EMAIL_GUIDE.md` | Complete feature documentation |
| `TESTING_GUIDE.md` | Testing procedures & checklist |
| `IMPLEMENTATION_SUMMARY.md` | Technical implementation details |

## Testing Your Implementation

### Test 1: Vessel Location (30 seconds)
```
1. Go to http://localhost:8080/route/index.html
2. Draw a quick route (2 waypoints)
3. Enter lat: -41.2865, lng: 174.8860
4. Click "Update Position & Recalculate"
5. ✓ Red marker appears on map
6. ✓ Position status shows coordinates
```

### Test 2: Click Map Mode (20 seconds)
```
1. Click "Click Map" button
2. Click anywhere on the map
3. ✓ Marker appears at clicked location
4. ✓ Inputs update automatically
5. ✓ Button returns to "Click Map"
```

### Test 3: Email Scheduler (5 minutes)
```
1. Edit email_scheduler_config.json
   - Update recipient email
   - Add SMTP credentials
   - Set a test time 1 minute away
2. Run: .\setup_email_scheduler.ps1 (as Admin)
3. Watch the email_scheduler.log file
4. ✓ Task appears in Windows Task Scheduler
5. ✓ Email sent at scheduled time
```

## Documentation

- **Full Setup Guide:** [VESSEL_LOCATION_AND_EMAIL_GUIDE.md](VESSEL_LOCATION_AND_EMAIL_GUIDE.md)
- **Testing Procedures:** [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Technical Details:** [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

## Common Issues & Solutions

### "Vessel marker not showing"
- Check latitude/longitude values are valid
- Zoom map out to see if marker is outside view
- Refresh the page

### "Email not sending"
- Verify `"enabled": true` in config
- Check SMTP credentials are correct
- Review `email_scheduler.log` for specific error

### "Task Scheduler setup fails"
- Run PowerShell as Administrator
- Ensure Python is in your PATH
- Check config file exists and is valid JSON

### "Forecast not recalculating"
- Verify route has at least 2 waypoints
- Check browser console (F12) for errors
- Try clicking "Run Forecast" manually first

## Key Features

✅ **Vessel Location**
- Manual input validation
- Interactive map click mode
- Visual marker with coordinates
- Automatic forecast recalculation
- Position persists across updates

✅ **Email Scheduler**
- Runs 24/7 automatically
- 4 configurable daily times
- SMTP with TLS encryption
- PDF attachment to email
- Comprehensive logging
- Error handling & retry logic

✅ **Easy Setup**
- JSON configuration (human-readable)
- One-command Windows Task Scheduler setup
- Detailed guides & examples
- Testing checklist included

## Next Steps

1. **Review the features:**
   - Open http://localhost:8080/route/index.html
   - Draw a route and test vessel position updates

2. **Configure email (optional):**
   - Edit `email_scheduler_config.json`
   - Run `setup_email_scheduler.ps1`

3. **Monitor the scheduler:**
   - Check `email_scheduler.log` for activity
   - View task in Windows Task Scheduler

## Support

For detailed instructions, see:
- **User Guide:** VESSEL_LOCATION_AND_EMAIL_GUIDE.md
- **Troubleshooting:** TESTING_GUIDE.md (bottom section)
- **Technical Details:** IMPLEMENTATION_SUMMARY.md

All files are in the wxtiles project root directory.

---

**Local Server:** http://localhost:8080/route/index.html  
**Files:** C:\Users\bbeamsley\OneDrive - MetService\Documents\Copilot\wxtiles\
