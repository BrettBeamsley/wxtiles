#!/usr/bin/env python3
"""
Email Scheduler for Route Forecast PDFs
Generates and emails route forecast PDFs 4 times per day
"""

import json
import os
import sys
import time
import smtplib
import logging
from datetime import datetime, time as dtime
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.utils import formatdate
from email import encoders

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('email_scheduler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

CONFIG_FILE = "email_scheduler_config.json"

def load_config():
    """Load configuration from JSON file"""
    if not os.path.exists(CONFIG_FILE):
        logger.error(f"Config file {CONFIG_FILE} not found")
        return None
    
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        return None

def generate_pdf_via_headless_browser(config, output_path):
    """
    Generate PDF using headless browser automation
    This requires the route HTML/JS to be accessible via a local server
    
    For production, integrate with Playwright or Selenium to automate:
    1. Open http://localhost:8080/route/index.html
    2. Set the route waypoints from config
    3. Set departure time to now
    4. Click "Run Forecast"
    5. Click "Export PDF"
    6. Save to output_path
    """
    try:
        logger.info(f"Would generate PDF via headless browser to {output_path}")
        logger.info("This requires Playwright or Selenium integration")
        logger.info(f"Route: {len(config['route_waypoints'])} waypoints")
        logger.info(f"Speed: {config['vessel_speed_knots']} knots")
        
        # TODO: Implement headless browser PDF generation
        # For now, create a placeholder PDF
        from datetime import datetime
        pdf_content = f"""
Route Forecast Report
Generated: {datetime.now()}
Route Waypoints: {len(config['route_waypoints'])}
Vessel Speed: {config['vessel_speed_knots']} knots

This is a placeholder. Full PDF generation requires:
- Playwright or Selenium for browser automation
- Integration with the route HTML/JS application
"""
        Path(output_path).write_text(pdf_content)
        return True
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return False

def send_email(config, pdf_path):
    """Send PDF via email"""
    try:
        if not os.path.exists(pdf_path):
            logger.error(f"PDF file not found: {pdf_path}")
            return False
        
        sender = config['sender_email']
        recipient = config['recipient_email']
        password = config['sender_password']
        smtp_server = config['smtp_server']
        smtp_port = config['smtp_port']
        
        # Check for placeholder credentials
        if password == "YOUR_PASSWORD_HERE" or not password:
            logger.warning("SMTP password not configured. Email will not be sent.")
            logger.info(f"To enable emails, update {CONFIG_FILE} with valid credentials")
            return False
        
        msg = MIMEMultipart()
        msg['From'] = sender
        msg['To'] = recipient
        msg['Date'] = formatdate(localtime=True)
        msg['Subject'] = f"Route Forecast Report - {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}"
        
        # Email body
        body = f"""Route Forecast Report

Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
Recipient: {recipient}

Please see attached PDF for detailed route forecast information.

Route Details:
- Waypoints: {len(config['route_waypoints'])}
- Vessel Speed: {config['vessel_speed_knots']} knots

---
This is an automated message from the wxtiles Route Forecast system.
"""
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach PDF
        try:
            with open(pdf_path, 'rb') as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
            
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', f'attachment; filename= {os.path.basename(pdf_path)}')
            msg.attach(part)
        except Exception as e:
            logger.error(f"Failed to attach PDF: {e}")
            return False
        
        # Send email
        logger.info(f"Connecting to {smtp_server}:{smtp_port}...")
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender, password)
            server.send_message(msg)
        
        logger.info(f"Email sent successfully to {recipient}")
        return True
        
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error: {e}")
        return False
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False

def parse_time(time_str):
    """Parse time string HH:MM to datetime.time"""
    try:
        return datetime.strptime(time_str, '%H:%M').time()
    except:
        return None

def should_run_now(config):
    """Check if current time matches any scheduled time"""
    if not config.get('enabled', False):
        return False
    
    now = datetime.now()
    current_time = now.time().replace(second=0, microsecond=0)
    
    for scheduled_time_str in config.get('schedule', []):
        scheduled_time = parse_time(scheduled_time_str)
        if scheduled_time:
            check_time = scheduled_time.replace(second=0, microsecond=0)
            if abs((now.replace(second=0, microsecond=0) - 
                   datetime.combine(now.date(), check_time)).total_seconds()) < 60:
                return True
    
    return False

def main():
    """Main scheduler loop"""
    logger.info("Route Forecast Email Scheduler starting...")
    
    config = load_config()
    if not config:
        logger.error("Failed to load configuration")
        return
    
    if not config.get('enabled', False):
        logger.warning("Email scheduler is disabled in config")
        logger.info(f"To enable, set 'enabled': true in {CONFIG_FILE}")
        return
    
    logger.info(f"Scheduled times: {config['schedule']}")
    logger.info(f"Recipient: {config['recipient_email']}")
    
    last_run = None
    check_interval = 60  # Check every minute
    
    try:
        while True:
            try:
                if should_run_now(config):
                    now = datetime.now()
                    # Avoid running multiple times in the same minute
                    if last_run is None or (now - last_run).total_seconds() > 300:
                        logger.info("=" * 60)
                        logger.info(f"Scheduled time reached. Generating report...")
                        
                        # Generate PDF
                        pdf_filename = f"route_forecast_{now.strftime('%Y%m%d_%H%M%S')}.pdf"
                        pdf_path = os.path.join("route_reports", pdf_filename)
                        
                        # Create reports directory if it doesn't exist
                        os.makedirs("route_reports", exist_ok=True)
                        
                        if generate_pdf_via_headless_browser(config, pdf_path):
                            # Send email
                            if send_email(config, pdf_path):
                                last_run = now
                                logger.info("Report generation and delivery complete")
                            else:
                                logger.warning("Report generated but email delivery failed")
                        else:
                            logger.error("PDF generation failed")
                        
                        logger.info("=" * 60)
                
                time.sleep(check_interval)
                
            except KeyboardInterrupt:
                logger.info("Scheduler interrupted by user")
                break
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                time.sleep(check_interval)
    
    except KeyboardInterrupt:
        logger.info("Scheduler stopped")

if __name__ == "__main__":
    main()
