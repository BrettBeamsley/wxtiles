# Route Forecast - Dynamic Vessel Location & Email Scheduling

This document describes the new dynamic vessel location and automated email scheduling features.

## Features Added

### 1. Dynamic Vessel Location Updates

The route forecast now supports real-time vessel location tracking and dynamic forecast recalculation:

**UI Controls:**
- **Latitude Input**: Enter current vessel latitude (-90 to 90)
- **Longitude Input**: Enter current vessel longitude (-180 to 180)
- **Update Position & Recalculate**: Button to update position and trigger forecast refresh
- **Click Map**: Interactive button to click on the map and set vessel position
- **Position Status**: Displays current vessel coordinates

**Features:**
- Visual vessel position marker on map (red circle with popup)
- Recalculate route forecast from new vessel position
- Input validation for latitude/longitude ranges
- Quick "Click on map" mode for precise positioning

**Usage:**
1. Draw your route with waypoints
2. Enter your current latitude/longitude in the "Current Vessel Location" section
3. Click "Update Position & Recalculate" to refresh the forecast
4. Alternatively, click "Click Map" and click on the map to set position
5. The vessel marker will appear on the map, and the forecast will update

### 2. Automated PDF Email Scheduling

The system can automatically generate route forecast PDFs and email them 4 times per day.

**Configuration File:** `email_scheduler_config.json`

```json
{
  "enabled": false,
  "schedule": ["06:00", "12:00", "18:00", "00:00"],
  "recipient_email": "your-email@metservice.co.nz",
  "sender_email": "wxtiles-reports@metservice.co.nz",
  "sender_password": "YOUR_PASSWORD_HERE",
  "smtp_server": "mail.metservice.co.nz",
  "smtp_port": 587,
  "route_waypoints": [
    {"lat": -41.286, "lng": 174.55, "name": "Start"},
    {"lat": -41.286, "lng": 175.55, "name": "End"}
  ],
  "vessel_speed_knots": 10,
  "pdf_title": "Route Forecast Report"
}
```

**Configuration Options:**

- **enabled**: Set to `true` to activate the scheduler
- **schedule**: Array of times in HH:MM format (24-hour) when PDFs should be generated and sent
- **recipient_email**: Email address to receive the PDF reports
- **sender_email**: Email account used to send reports (must have SMTP access)
- **sender_password**: Password for the sender email account
- **smtp_server**: SMTP server address
- **smtp_port**: SMTP port (usually 587 for TLS)
- **route_waypoints**: Array of waypoints for the route
- **vessel_speed_knots**: Default vessel speed in knots

## Setup Instructions

### Step 1: Configure Email Settings

Edit `email_scheduler_config.json`:

```bash
{
  "enabled": true,
  "schedule": ["06:00", "12:00", "18:00", "00:00"],
  "recipient_email": "your-name@metservice.co.nz",
  "sender_email": "noreply@metservice.co.nz",
  "sender_password": "your-secure-password",
  "smtp_server": "mail.metservice.co.nz",
  "smtp_port": 587,
  ...
}
```

**Security Notes:**
- Do NOT commit credentials to version control
- Consider using environment variables for sensitive data in production
- Use app-specific passwords for email accounts with 2FA
- Ensure sender_email has SMTP permissions

### Step 2: Set Up Windows Task Scheduler (Automated)

Run as Administrator:

```powershell
# From the wxtiles directory
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup_email_scheduler.ps1
```

This will:
1. Verify Python is installed
2. Check configuration file exists
3. Create scheduled tasks for 06:00, 12:00, 18:00, and 00:00 UTC
4. Register them with Windows Task Scheduler

### Step 3: Manual Scheduler (Alternative)

If you prefer to run manually or on a different schedule:

```bash
# Run the email scheduler directly
python email_scheduler.py
```

The script will:
- Run continuously
- Check the schedule every minute
- Generate and email PDFs at configured times
- Log all activity to `email_scheduler.log`

To stop: Press `Ctrl+C`

### Step 4: Verify Setup

**Check Windows Task Scheduler:**
1. Open `taskschd.msc`
2. Look for task: `WxTiles_RouteForecasetEmailScheduler`
3. Verify trigger times match your configuration
4. View task history for execution logs

**Check Logs:**
```bash
# View scheduler activity
tail -f email_scheduler.log
```

## Technical Details

### Vessel Location State

The vessel location is stored in the application state:
- `state.vesselLat`: Current latitude
- `state.vesselLng`: Current longitude
- `state.vesselMarker`: Leaflet map marker

### Map Integration

- Vessel position shown as red circle marker
- Marker includes popup with coordinates
- Click "Click Map" to enter interactive mode
- Map dragging disabled during position selection

### Forecast Recalculation

When vessel position updates:
1. Position stored in state
2. Visual marker placed on map
3. Route forecast recalculated with existing waypoints
4. Forecast starts from route beginning (not vessel position)

**Future Enhancement:** To recalculate from vessel position to destination, the first waypoint could be automatically updated to the current vessel location.

### PDF Generation

**Current Status:** Placeholder implementation

**To Enable Full PDF Generation:**

Integrate headless browser automation using Playwright or Selenium:

```python
# In email_scheduler.py, implement:
async def generate_pdf_via_headless_browser(config, output_path):
    # 1. Launch browser
    # 2. Navigate to http://localhost:8080/route/index.html
    # 3. Set waypoints from config
    # 4. Click "Run Forecast"
    # 5. Click "Export PDF"
    # 6. Save file to output_path
```

Required packages:
```bash
pip install playwright
python -m playwright install
```

### Email Delivery

Uses Python's built-in `smtplib` for SMTP email delivery:
- Supports TLS/STARTTLS encryption
- Automatically attaches generated PDF
- Includes formatted email body with route details
- Logs success/failure for each attempt

## Troubleshooting

### "PDF library not loaded yet" Error

**Solution:** The jsPDF library may not have loaded. Refresh the page and try again.

### Vessel Position Not Appearing on Map

**Solutions:**
1. Check latitude/longitude values are valid
2. Verify "Update Position & Recalculate" was clicked
3. Check browser console for JavaScript errors
4. Zoom out to see if marker is outside visible area

### Email Not Sending

**Check:**
1. `enabled` is set to `true` in config
2. SMTP credentials are correct (test separately)
3. `email_scheduler.log` for specific error message
4. SMTP server is accessible from your network
5. Firewall isn't blocking SMTP port

**Test Email Manually:**
```python
import smtplib
from email.mime.text import MIMEText

# Replace with your settings
sender = "your-email@metservice.co.nz"
password = "your-password"
recipient = "test@example.com"

msg = MIMEText("Test message")
msg['Subject'] = "Test"
msg['From'] = sender
msg['To'] = recipient

server = smtplib.SMTP("mail.metservice.co.nz", 587)
server.starttls()
server.login(sender, password)
server.send_message(msg)
server.quit()

print("Email sent successfully")
```

### Scheduler Not Running

**Check Windows Task Scheduler:**
```powershell
Get-ScheduledTask -TaskName "WxTiles_RouteForecasetEmailScheduler" | Select-Object *
```

**Common Issues:**
1. Task disabled - enable in Task Scheduler UI
2. User account lost permissions - re-run setup script
3. Script path changed - update task action with new path
4. Python not in PATH - add Python directory to system PATH

**Restart Task Scheduler Service:**
```powershell
Restart-Service -Name "Schedule" -Force
```

## File Structure

```
wxtiles/
├── route/
│   ├── index.html          # Route UI with vessel location controls
│   ├── route.js            # JavaScript (includes updateVesselPosition, etc.)
│   └── styles.css          # Styling
├── email_scheduler_config.json    # Configuration for scheduler
├── email_scheduler.py             # Main scheduler script
├── run_email_scheduler.bat        # Batch file to run scheduler
├── setup_email_scheduler.ps1      # PowerShell setup script
└── email_scheduler.log            # Scheduler activity log (created at runtime)
```

## Future Enhancements

1. **Dynamic Route Updates**: Update first waypoint to vessel position for forward-looking forecasts
2. **Full PDF Generation**: Integrate Playwright/Selenium for complete PDF automation
3. **Database Logging**: Store generated PDFs and email delivery records
4. **Web Dashboard**: View scheduling status, manually trigger generation, manage recipients
5. **Multiple Recipients**: Support multiple email addresses per schedule
6. **Customizable Schedule**: Configure different routes for different times
7. **Cloud Hosting**: Deploy to cloud service for 24/7 availability

## Support

For issues or questions:
1. Check `email_scheduler.log` for detailed error messages
2. Review this document's troubleshooting section
3. Test SMTP connectivity separately
4. Verify all configuration values in `email_scheduler_config.json`
