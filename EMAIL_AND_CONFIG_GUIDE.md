# Route Forecast - Email Automation & Configuration Management

This guide describes the new email automation and configuration management features added to the Route Forecast Explorer.

## Features Overview

### 1. Email Automation Controls

The Route Forecast Explorer now includes a **Section 4: Email Automation** with controls to:
- Enter a recipient email address
- Select email frequency (2x or 4x per day)
- Configure the email scheduler
- Send test emails

**Features:**
- Email status display showing configured recipient and frequency
- Persistent storage of email settings in browser localStorage
- Integration with backend email scheduler service
- Quick test email capability

**UI Elements:**
- **Email Address Input**: Enter the destination email (e.g., your-name@metservice.co.nz)
- **Frequency Selection**: Choose 2x daily or 4x daily delivery
- **Configure Scheduler Button**: Opens configuration guide for backend setup
- **Test Email Button**: Sends a test email to verify SMTP configuration

**Supported Schedule:**
- **2x Daily**: 06:00 UTC, 18:00 UTC (morning and evening)
- **4x Daily**: 06:00 UTC, 12:00 UTC, 18:00 UTC, 00:00 UTC (every 6 hours)

### 2. Configuration Management

The Route Forecast Explorer now includes a **Section 5: Save & Load Configuration** that allows you to:
- Save current route, vessel settings, and email configuration
- Load previously saved configurations
- Export all configurations as JSON
- Delete configurations you no longer need

**What Gets Saved:**
- Vessel speed and speed unit
- Departure time
- Route waypoints (all coordinates and names)
- Selected weather datasets (wave and wind)
- Email recipient address and frequency
- Selected data variables

**Persistent Storage:**
- Configurations stored in browser localStorage (survives page refresh)
- Export capability for backup/sharing
- Configuration list showing all saved setups with creation dates

**Use Cases:**
1. **Regular Routes**: Save a "Cook Strait Daily Run" configuration and load it quickly
2. **Multiple Scenarios**: Save "Calm Conditions Route" and "Storm Planning Route" separately
3. **Team Sharing**: Export configurations as JSON and share with colleagues
4. **Backup**: Export all configurations for safekeeping

## How to Use

### Setting Up Email Automation

1. **Enter Email Address**
   - Scroll to Section 4: Email Automation
   - Enter your email address in the "Recipient Email Address" field
   - The email status will update to show your address and frequency

2. **Choose Frequency**
   - Select either "2x Daily" or "4x Daily"
   - Selection is automatically saved

3. **Configure Backend**
   - Click "Configure Scheduler" for detailed setup instructions
   - Edit `email_scheduler_config.json` with your SMTP credentials
   - Run `setup_email_scheduler.ps1` to register with Windows Task Scheduler

4. **Test Configuration**
   - Click "Test Email" to send a test message
   - Verify receipt in your inbox
   - Check `email_scheduler.log` for any delivery issues

### Saving and Loading Configurations

1. **Save Current Configuration**
   - Set up your route (waypoints, vessel speed, departure time, weather datasets)
   - Scroll to Section 5: Save & Load Configuration
   - Enter a name (e.g., "Cook Strait Route - October 2024")
   - Click "Save"
   - Your configuration appears in the "Saved Configurations" list

2. **Load a Saved Configuration**
   - Click "Load" button
   - Select the configuration from the list
   - All settings are restored (route, speed, departure time, weather, email)
   - Route forecast automatically recalculates with new settings

3. **Export Configurations**
   - Click "Export" to download all saved configurations as JSON
   - File is named: `route_configurations_YYYY-MM-DD.json`
   - Useful for backup or sharing with team members

4. **Delete a Configuration**
   - In the "Saved Configurations" list, click "Delete" next to any configuration
   - Confirm deletion when prompted

## Technical Details

### Configuration Storage

Configurations are stored in **browser localStorage** with the following structure:

```javascript
{
  id: "1693564800000",           // Timestamp-based ID
  name: "Cook Strait Route",     // User-provided name
  created: "2024-01-15T10:30:00Z", // ISO timestamp
  vesselSpeed: 10,               // Speed in original units
  speedUnit: "knots",            // Unit: knots, km/h, or m/s
  departureTime: "2024-01-15T10:30", // Local time
  waypoints: [
    { lat: -41.2865, lng: 174.7787, name: "Wellington" },
    { lat: -41.2890, lng: 174.0080, name: "Picton" }
  ],
  waveDataset: "gfs_0.25",       // Selected wave dataset ID
  waveVariable: "hs",            // Selected wave variable
  windDataset: "gfs_0.25",       // Selected wind dataset ID
  windVariable: "wind_speed",    // Selected wind variable
  emailAddress: "user@email.com", // Email recipient
  emailFrequency: "4"            // "2" or "4" times per day
}
```

### Email Settings Storage

Email settings are stored separately in localStorage:
- `wxtiles_email_address`: Recipient email
- `wxtiles_email_frequency`: "2" or "4"
- `wxtiles_route_configs`: JSON array of all configurations

### Browser localStorage Limits

- Storage limit: typically 5-10MB per origin
- Settings persist across browser sessions
- Can be cleared by clearing browser cache/cookies
- No sensitive credentials stored (SMTP credentials in backend only)

## Integration with Email Scheduler

The email automation feature integrates with the backend email scheduler:

**Backend Files:**
- `email_scheduler.py`: Main scheduler script
- `email_scheduler_config.json`: Configuration for SMTP and routes
- `setup_email_scheduler.ps1`: Windows Task Scheduler setup
- `run_email_scheduler.bat`: Batch runner script

**Backend Configuration (`email_scheduler_config.json`):**

```json
{
  "enabled": true,
  "schedule": ["06:00", "12:00", "18:00", "00:00"],
  "recipient_email": "your-email@metservice.co.nz",
  "sender_email": "noreply@metservice.co.nz",
  "sender_password": "YOUR_SMTP_PASSWORD",
  "smtp_server": "mail.metservice.co.nz",
  "smtp_port": 587,
  "route_waypoints": [...],
  "vessel_speed_knots": 10
}
```

**Important:** The GUI saves email address and frequency to localStorage, but the backend scheduler needs to be manually configured with SMTP credentials and route waypoints.

## Troubleshooting

### Configuration Not Saving

**Problem:** Saved configurations don't persist after page refresh

**Solutions:**
1. Check if browser allows localStorage (may be disabled)
2. Verify available storage space isn't full
3. Try a different browser
4. Check browser console for JavaScript errors

**To Debug:**
```javascript
// In browser console:
localStorage.getItem("wxtiles_route_configs")
localStorage.getItem("wxtiles_email_address")
```

### Configuration Not Loading

**Problem:** "Load" button doesn't restore settings

**Solutions:**
1. Ensure configuration exists in the list
2. Check for JavaScript errors in browser console
3. Try reloading the page and loading again
4. Verify waypoints have valid coordinates

### Email Not Sending

**Problem:** Test email fails or scheduled emails don't arrive

**Solutions:**
1. Verify SMTP credentials in `email_scheduler_config.json`
2. Check `email_scheduler.log` for specific error messages
3. Ensure email address is correctly entered
4. Test SMTP connection separately (see VESSEL_LOCATION_AND_EMAIL_GUIDE.md)
5. Check spam/junk folder for delivered emails

### localStorage Full Error

**Problem:** Browser reports localStorage quota exceeded

**Solutions:**
1. Export and backup important configurations
2. Delete old/unused configurations
3. Clear browser cache (may delete all configs)
4. Use private/incognito browsing mode (temporary storage)

## Security Considerations

### What's Stored Locally

✅ **Safe to store locally:**
- Route waypoints and coordinates
- Vessel speed and dynamics
- Email recipient address
- Forecast preferences

❌ **Should NOT be stored locally:**
- SMTP passwords (stored in backend config only)
- API keys
- Sensitive credentials

### Best Practices

1. **Don't store SMTP credentials in browser localStorage**
   - Only the email address is stored
   - Passwords stay in backend `email_scheduler_config.json`

2. **Export sensitive configurations carefully**
   - JSON export contains route and email data
   - Don't share exported files in email or unencrypted channels

3. **Use different configurations for different purposes**
   - Separate "Public Route Sharing" from "Sensitive Planning Route"

4. **Regularly backup important configurations**
   - Export configurations to secured location
   - Test restore periodically

## Limitations and Future Enhancements

### Current Limitations

1. **Browser localStorage only**
   - Configurations don't sync across devices
   - Maximum ~5-10MB storage per domain

2. **SMTP credentials in backend only**
   - GUI doesn't allow SMTP configuration
   - Requires manual editing of `email_scheduler_config.json`

3. **Single recipient email**
   - Can't specify multiple recipients per schedule
   - Each email address requires separate scheduler instance

4. **Windows Task Scheduler only**
   - Email scheduling currently supports Windows only
   - Would need cron/launchd for Linux/macOS

### Planned Enhancements

1. **Cloud Sync**
   - Sync configurations across devices
   - Share configurations via secure link

2. **Multi-recipient Support**
   - Create distribution lists
   - Different recipients for different routes

3. **Advanced Scheduling**
   - Custom time intervals
   - Conditional sending based on weather
   - Skip forecasts if conditions don't meet thresholds

4. **Configuration Versioning**
   - Version history tracking
   - Restore previous configurations
   - Diff view between versions

5. **Team Collaboration**
   - Shared configuration repository
   - Approval workflow for route changes
   - Audit log of who changed what

## Documentation References

- **Email Scheduler Setup**: See `VESSEL_LOCATION_AND_EMAIL_GUIDE.md`
- **Route Capability Updates**: See `ROUTE_CAPABILITY_UPDATES.md`
- **Quick Reference**: See `QUICK_REFERENCE.md`

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console for JavaScript errors
3. Check `email_scheduler.log` for backend issues
4. Verify file permissions and paths
5. Test SMTP connectivity separately

---

**Version:** 1.0  
**Updated:** 2024  
**Status:** Ready for Use ✅
