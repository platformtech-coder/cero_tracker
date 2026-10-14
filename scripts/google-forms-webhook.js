/**
 * ============================================================================
 * PERBICUBS - Google Forms to Next.js Webhook Relay
 * ============================================================================
 * Paste this script into your Google Forms Script Editor:
 * (Open Form -> Click 3 dots at top-right -> Script editor -> Paste this entire file -> Save)
 *
 * It automatically handles BOTH:
 *  1. Orientation Booking Form
 *  2. Reading Circle Signup Form
 *
 * For multi-cub registrations, it sends individual records for each cub so
 * our backend can match each sibling separately against master_cubs.
 * ============================================================================
 */

// Configuration: Reads from Script Properties first, with safe fallback to production URL
function getWebhookConfig() {
  try {
    var props = PropertiesService.getScriptProperties();
    return {
      url: props.getProperty('WEBHOOK_URL') || 'https://cero-tracker.vercel.app/api/webhooks/forms',
      secret: props.getProperty('WEBHOOK_SECRET') || 'cero_tracker_secret_2026_xyz'
    };
  } catch (e) {
    return {
      url: 'https://cero-tracker.vercel.app/api/webhooks/forms',
      secret: 'cero_tracker_secret_2026_xyz'
    };
  }
}

/**
 * Setup Helper: Run this function once in the Apps Script editor to securely store
 * your webhook URL and secret in Script Properties (File -> Project Properties -> Script Properties).
 */
function setupWebhookProperties() {
  PropertiesService.getScriptProperties().setProperties({
    WEBHOOK_URL: 'https://cero-tracker.vercel.app/api/webhooks/forms',
    WEBHOOK_SECRET: 'cero_tracker_secret_2026_xyz'
  });
  Logger.log('Webhook properties saved to ScriptProperties successfully.');
}

/**
 * Main Trigger Handler
 * Trigger setup: Run -> onFormSubmit -> Event Source: From form -> Event Type: On form submit
 */
function onFormSubmit(e) {
  var form = null;
  var response = null;

  try {
    form = FormApp.getActiveForm();
  } catch (err) {
    Logger.log('Not running in a container-bound Form: ' + err);
  }

  if (e && e.response) {
    response = e.response;
  } else if (form) {
    var responses = form.getResponses();
    if (responses.length > 0) {
      response = responses[responses.length - 1];
    }
  }

  if (!response) {
    Logger.log('No form response found.');
    return;
  }

  var formTitle = form ? form.getTitle().toLowerCase() : '';
  var isOrientation = formTitle.includes('orientation');
  var formSource = isOrientation ? 'Orientation Signup' : 'Reading Circle Signup';

  Logger.log('Processing submission for: ' + formSource);

  if (isOrientation) {
    processOrientationSubmission(response, formSource);
  } else {
    processReadingCircleSubmission(response, formSource);
  }
}

/**
 * Parse & Send Orientation Form
 */
function processOrientationSubmission(response, formSource) {
  var itemResponses = response.getItemResponses();
  var parentName = '';
  var parentPhone = '';
  var sharedSession = '';
  var childFirstNames = [];
  var childLastNames = [];
  var childCards = [];

  itemResponses.forEach(function (ir) {
    var title = ir.getItem().getTitle();
    var lower = title.toLowerCase();
    var ans = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse() || '');
    if (!ans) return;

    if (lower.includes('parent') && (lower.includes('name') || lower.includes('full'))) {
      parentName = ans;
    } else if (lower.includes('parent') && (lower.includes('phone') || lower.includes('whatsapp') || lower.includes('contact'))) {
      parentPhone = ans;
    } else if (lower.includes('phone') || lower.includes('whatsapp') || lower.includes('contact number')) {
      if (!parentPhone) parentPhone = ans;
    } else if (lower.includes('session') || lower.includes('attend') || lower.includes('schedule')) {
      sharedSession = ans;
    } else if (lower.includes('child') && lower.includes('first name')) {
      childFirstNames.push(ans.trim());
    } else if (lower.includes('child') && lower.includes('last name')) {
      childLastNames.push(ans.trim());
    } else if (lower.includes('library card') || lower.includes('cub id') || lower.includes('card number')) {
      childCards.push(ans.trim());
    }
  });

  var maxCubs = Math.max(childFirstNames.length, childLastNames.length);

  // Fallback if questions weren't named "Child's First Name"
  if (maxCubs === 0) {
    // Check for single child name field
    itemResponses.forEach(function (ir) {
      var lower = ir.getItem().getTitle().toLowerCase();
      var ans = String(ir.getResponse() || '').trim();
      if ((lower.includes('cub') || lower.includes('child') || lower.includes('ward')) && lower.includes('name')) {
        childFirstNames.push(ans);
        childLastNames.push('');
      }
    });
    maxCubs = childFirstNames.length;
  }

  // If still no cub found, fallback to parent name cub
  if (maxCubs === 0) {
    maxCubs = 1;
    childFirstNames.push(parentName ? parentName + ' Cub' : 'New Cub');
    childLastNames.push('');
  }

  for (var i = 0; i < maxCubs; i++) {
    var fName = childFirstNames[i] || '';
    var lName = childLastNames[i] || '';
    var fullName = [fName, lName].filter(Boolean).join(' ').trim();
    var card = childCards[i] || '';

    if (!fullName) continue;

    sendWebhookPayload({
      form_source: formSource,
      parent_name: parentName,
      parent_phone: parentPhone,
      cub_name: fullName,
      library_card: card,
      selected_session: sharedSession,
      idempotency_key: response.getId() + '_ori_' + i
    });
  }
}

/**
 * Parse & Send Reading Circle Form
 */
function processReadingCircleSubmission(response, formSource) {
  var itemResponses = response.getItemResponses();
  var parentName = '';
  var parentPhone = '';
  var cubMap = {};

  itemResponses.forEach(function (ir) {
    var title = ir.getItem().getTitle();
    var lower = title.toLowerCase();
    var ans = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse() || '');
    if (!ans) return;

    // Parent Fields
    if (!title.match(/Cub\s*\d/i)) {
      var isPhone = lower.includes('phone') || lower.includes('whatsapp') || lower.includes('contact');
      if (isPhone) {
        parentPhone = ans;
      } else if (lower.includes('name') || lower.includes('parent') || lower.includes('guardian') || lower.includes('full name')) {
        parentName = ans;
      }
      return;
    }

    // Numbered Cub Fields (e.g. "Cub 1: First Name", "Cub 1: Session")
    var match = title.match(/Cub\s*(\d+)/i);
    if (!match) return;
    var idx = parseInt(match[1], 10);
    if (!cubMap[idx]) {
      cubMap[idx] = { firstName: '', lastName: '', libraryCard: '', grade: '', session: '' };
    }

    if (lower.includes('first name')) {
      cubMap[idx].firstName = ans.trim();
    } else if (lower.includes('last name')) {
      cubMap[idx].lastName = ans.trim();
    } else if (lower.includes('library card') || lower.includes('card number') || lower.includes('cub id')) {
      cubMap[idx].libraryCard = ans.trim();
    } else if (lower.includes('grade') || lower.includes('class')) {
      cubMap[idx].grade = ans.trim();
    } else if (lower.includes('session') || lower.includes('schedule') || lower.includes('day') || lower.includes('time')) {
      cubMap[idx].session = ans.trim();
    }
  });

  var cubIndices = Object.keys(cubMap).sort(function (a, b) { return a - b; });

  if (cubIndices.length === 0) {
    Logger.log('No cubs identified with "Cub N:" prefix. Checking single-cub fallback...');
    // Fallback: single cub
    var singleName = '';
    var singleGrade = '';
    var singleSession = '';
    var singleCard = '';
    itemResponses.forEach(function (ir) {
      var lower = ir.getItem().getTitle().toLowerCase();
      var ans = String(ir.getResponse() || '').trim();
      if ((lower.includes('child') || lower.includes('cub')) && lower.includes('name')) singleName = ans;
      if (lower.includes('grade')) singleGrade = ans;
      if (lower.includes('session')) singleSession = ans;
      if (lower.includes('card')) singleCard = ans;
    });

    if (singleName) {
      sendWebhookPayload({
        form_source: formSource,
        parent_name: parentName,
        parent_phone: parentPhone,
        cub_name: singleName,
        library_card: singleCard,
        grade: singleGrade,
        selected_session: singleSession,
        idempotency_key: response.getId() + '_rc_0'
      });
      return;
    }
  }

  cubIndices.forEach(function (idx) {
    var c = cubMap[idx];
    var fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    if (!fullName) return;

    sendWebhookPayload({
      form_source: formSource,
      parent_name: parentName,
      parent_phone: parentPhone,
      cub_name: fullName,
      library_card: c.libraryCard,
      grade: c.grade,
      selected_session: c.session,
      idempotency_key: response.getId() + '_rc_' + idx
    });
  });
}

/**
 * Dispatch HTTP POST to the Next.js Webhook
 */
function sendWebhookPayload(payload) {
  var config = getWebhookConfig();
  Logger.log('Sending webhook for cub: ' + payload.cub_name + ' | Parent phone: ' + payload.parent_phone);

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': config.secret
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var res = UrlFetchApp.fetch(config.url, options);
    var code = res.getResponseCode();
    var content = res.getContentText();
    Logger.log('Status: ' + code + ' | Body: ' + content);
  } catch (err) {
    Logger.log('Webhook transmission error: ' + err.toString());
  }
}

/**
 * ============================================================================
 * ONE-CLICK TEST FUNCTION
 * ============================================================================
 * You can select "testWebhookConnection" in the Apps Script toolbar
 * and click "Run" right now to test connectivity immediately!
 */
function testWebhookConnection() {
  var config = getWebhookConfig();
  Logger.log('Testing connectivity to: ' + config.url);
  var testPayload = {
    form_source: 'Orientation Signup',
    parent_name: 'Test Parent',
    parent_phone: '0241234567',
    cub_name: 'Test Cub',
    selected_session: 'Tuesday 5:00 pm – 5:45 pm',
    idempotency_key: 'test_' + new Date().getTime()
  };

  sendWebhookPayload(testPayload);
}
