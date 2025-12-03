# AutoAttend HR & Manager User Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [Managing Employees](#managing-employees)
4. [Viewing Attendance](#viewing-attendance)
5. [Dashboard & Statistics](#dashboard--statistics)
6. [Account Management](#account-management)
7. [Troubleshooting](#troubleshooting)

---

## System Overview

**AutoAttend** is an automated attendance tracking system that uses Bluetooth Low Energy (BLE) technology to record employee check-ins and check-outs without manual intervention.

### How It Works

1. **ESP32 Office Beacon**: A stationary BLE beacon device placed at office entrance that continuously advertises a unique office identifier
2. **Employee Smartphone App**: Each employee's phone runs a scanning app that continuously detects the office beacon
3. **Automatic Recording**: When the employee's phone detects the beacon:
   - First detection = **Check-in** (employee arrived at office)
   - After 30 seconds without detection = **Check-out** (employee left office)
   - The phone app automatically sends attendance data to the cloud server
4. **Web Dashboard**: HR and managers access real-time attendance data through a secure web interface

### Key Features

✅ **Contactless**: No need to swipe cards or sign in manually  
✅ **Real-time**: Attendance updates instantly when employees arrive/leave  
✅ **Automated**: Phone app runs in background, no employee interaction needed  
✅ **Secure**: Multi-user authentication with role-based access  
✅ **Cloud-based**: Accessible from anywhere with internet connection  

---

## Getting Started

### 1. Accessing the System

**Website URL**: https://auto.thumbstack-autoattend.workers.dev

### 2. Login Credentials

The system supports multiple user accounts:

| Role | Username | Initial Password | Notes |
|------|----------|------------------|-------|
| Admin | `Admin` | `Pass@123` | Full system access, never expires |
| HR Manager | `himanshu.k` or `himanshu.k@thumbstack.co` | `Pass@123` | Must change on first login |
| HR Manager | `ritesh.k` or `ritesh.k@thumbstack.co` | `Pass@123` | Must change on first login |
| HR Manager | `keyur.a` or `keyur.a@thumbstack.co` | `Pass@123` | Must change on first login |

**Important**: HR users will be required to create a new password immediately after their first login for security reasons.

### 3. First Login Process

**For HR Users (First Time Only)**:

1. Go to https://auto.thumbstack-autoattend.workers.dev
2. Enter your username (e.g., `himanshu.k`) or email
3. Enter the temporary password: `Pass@123`
4. Click **Sign In**
5. You'll be prompted to change your password:
   - Enter the temporary password again
   - Create a new password (minimum 8 characters)
   - Confirm your new password
   - Click **Update & Continue**
6. You're now logged in with your personal secure password

**For Admin User**:
- Can login anytime with `Admin / Pass@123`
- Optional: Change password via profile menu (key icon in top-right)

### 4. Navigation

Once logged in, you'll see three main sections:

- **Dashboard** 📊 - Overview statistics and today's activity
- **Employees** 👥 - Manage employee records and badges
- **Attendance** 🕐 - View detailed attendance logs and history

---

## Managing Employees

### Adding a New Employee

1. Click **Employees** in the top navigation
2. Click the **+ Add Employee** button (top right)
3. Fill in the required information:

   **Basic Information** (Required):
   - **Full Name**: Employee's complete name
   - **Role**: Job title (e.g., Employee, Manager, Intern)
   - **Department**: Which team they belong to
   - **Badge Hex Value**: Unique identifier for the employee's phone app*

   **Optional Details**:
   - Employee ID (e.g., EMP01)
   - Email address
   - Phone number
   - Hire date
   - Manager name
   - Office location
   - Working mode (Office/Hybrid/Work From Home)
   - Notes

4. Click **Create Employee**

> **\*Getting the Badge Hex Value**: This is a unique code that identifies each employee in the smartphone app. The system administrator or IT team will provide this value when setting up the employee's phone app. It typically looks like: `4872697468696B`

### Editing Employee Information

1. Navigate to **Employees**
2. Find the employee in the list
3. Click the **Edit** button (✏️ icon) next to their name
4. Update any fields as needed
5. Click **Save Changes**

### Deactivating an Employee

When an employee leaves the company:

1. Go to **Employees**
2. Click **Edit** on the departing employee
3. Toggle the **Active** switch to OFF
4. Click **Save Changes**

The employee record is preserved for historical reporting but they can no longer check in/out.

### Viewing Employee Details

Click on any employee card to see:
- Full profile information
- Recent attendance history
- Badge status
- Contact details

---

## Viewing Attendance

### Today's Attendance

1. Click **Attendance** in the navigation menu
2. By default, you'll see today's records
3. Each record shows:
   - Employee name and photo
   - Check-in time
   - Check-out time (if they've left)
   - Total hours worked
   - Status badge (Present/Left)

### Filtering Attendance Records

Use the filters at the top to narrow down results:

**By Date**:
- Click the date picker to select a specific day
- Or use the quick filters: Today, Yesterday, This Week, This Month

**By Employee**:
- Type a name in the search box to filter by specific person

**By Department**:
- Select from the dropdown to see only specific teams

**By Status**:
- **Check-in**: Show only arrivals
- **Check-out**: Show only departures
- **All**: Show both (default)

### Understanding Attendance Status

| Status | Icon | Meaning |
|--------|------|---------|
| **Present** | 🟢 | Employee is currently in the office |
| **Left** | 🔴 | Employee has checked out for the day |
| **Break** | 🟡 | Employee is on a short break |

### Exporting Attendance Data

1. Apply any filters you want (date range, department, etc.)
2. Click the **Export** button (top right)
3. Choose format:
   - **CSV** - Opens in Excel/Google Sheets
   - **PDF** - Printable report
4. File downloads automatically to your device

---

## Dashboard & Statistics

### Understanding the Dashboard

When you login, the Dashboard shows:

**Today's Summary Cards**:
- **Total Check-ins**: How many employees arrived today
- **Currently Present**: Who's in the office right now
- **Total Employees**: Active headcount
- **Attendance Rate**: Percentage present today

**Recent Activity Feed**:
- Live stream of check-ins and check-outs
- Updates automatically every few seconds
- Shows employee name, action, and timestamp

**Weekly Trends Chart**:
- Visual graph of attendance patterns
- Helps identify busy/quiet days
- Useful for capacity planning

### Real-time Updates

The dashboard refreshes automatically, so you always see current data without needing to reload the page.

---

## Account Management

### Changing Your Password

**From Desktop/Tablet**:
1. Look for the key icon (🔑) in the top-right corner
2. Click it to open the password change dialog
3. Enter your current password
4. Enter your new password (min 8 characters)
5. Confirm the new password
6. Click **Save new password**

**From Mobile**:
1. Tap the menu icon (☰) in top-right
2. Scroll down to find **Change password** button
3. Follow the same steps as desktop

### Security Best Practices

✅ **Use a strong password**: Mix uppercase, lowercase, numbers, and symbols  
✅ **Don't share credentials**: Each person should have their own account  
✅ **Change passwords regularly**: Update every 90 days  
✅ **Log out on shared devices**: Especially on public computers  

### Signing Out

Click the **Sign Out** button (🚪 icon) in the top-right corner anytime.

---

## Troubleshooting

### Common Issues & Solutions

#### "Login Failed" Error

**Possible Causes**:
- Incorrect username or password
- Account not yet created by admin
- Browser cached old credentials

**Solutions**:
1. Double-check your username (try both short name and full email)
2. Ensure Caps Lock is OFF
3. Try clearing browser cache (Ctrl+Shift+Delete)
4. Contact Admin to verify your account exists

#### Employee Not Recording Attendance

**Check**:
1. Is the employee record Active in the system?
2. Is the Badge Hex Value entered correctly?
3. Is the ESP32 office beacon powered on and connected to WiFi?
4. Does the employee have the smartphone app installed and running?
5. Is the employee's phone Bluetooth enabled?

**Next Steps**:
- Contact IT support to verify beacon status
- Ask employee to ensure their phone app is running in background
- Check if phone app has necessary permissions (Location, Bluetooth)
- Check if recent attendance shows in the system (might be delay)

#### Missing Attendance Records

**Possible Reasons**:
- Employee didn't come within range of office beacon (5-10 meters typically)
- Office beacon was offline during that time
- Employee's phone app not running
- Phone Bluetooth was disabled
- System maintenance window

**What to Do**:
1. Check the Attendance page with date filters
2. Verify the employee was actually present that day
3. Contact IT if beacon issues suspected
4. Ask employee to check if phone app is installed and has permissions
5. Manual entry may be needed (contact Admin)

#### Can't See Certain Employees

**Verify**:
- Are filters applied? (Clear all filters)
- Is the employee Active? (Check Employees page)
- Do you have permission to view that department?

#### Dashboard Shows Zero Check-ins

**Check**:
- Is today a weekend or holiday?
- Refresh the browser (F5)
- Verify office beacon status with IT
- Check if employees have phone app installed and running
- Check if system time is correct

### Getting Help

**For General Questions**:
- Email: hr@thumbstack.co
- Internal Slack: #autoattend-support

**For Technical Issues**:
- Email: it@thumbstack.co
- Phone: (Internal IT Helpdesk)

**For Account/Password Problems**:
- Contact the Admin user directly
- They can reset passwords and verify account status

---

## Appendix: Quick Reference

### Daily Workflow Checklist

**Morning**:
- ✅ Login to dashboard
- ✅ Verify office beacon is recording (check recent activity)
- ✅ Review who's present vs expected

**Throughout Day**:
- ✅ Monitor real-time check-ins
- ✅ Note any anomalies or missing staff
- ✅ Respond to employee phone app issues

**End of Day**:
- ✅ Review full day's attendance
- ✅ Export records if needed for payroll
- ✅ Sign out securely

### Keyboard Shortcuts (Desktop)

- `Ctrl + K` - Quick search for employees
- `Ctrl + F` - Filter attendance
- `Ctrl + E` - Export current view
- `Esc` - Close dialogs/modals

### Browser Compatibility

✅ **Recommended**: Chrome, Edge, Firefox, Safari (latest versions)  
⚠️ **Not Supported**: Internet Explorer  

### Mobile Access

The system is fully responsive and works on:
- iOS (iPhone/iPad)
- Android phones and tablets
- Touch-optimized interface automatically adapts

---

**Document Version**: 1.0  
**Last Updated**: December 2025  
**For System Version**: AutoAttend v1.0.0

**Questions or Feedback?**  
Contact your IT administrator or email support@thumbstack.co
