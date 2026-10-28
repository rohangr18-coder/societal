import { SupportedLanguage } from '../types';

export interface TranslationDictionary {
  [key: string]: string;
}

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    // Navigation
    'nav.brand': 'ResQBite',
    'nav.tagline': 'Food Rescue Network',
    'nav.home': 'Home',
    'nav.browse': 'Browse Food',
    'nav.map': 'Live GPS Map',
    'nav.impact': 'Impact Analytics',
    'nav.organizations': 'Verified NGOs',
    'nav.dashboard': 'My Dashboard',
    'nav.admin': 'Admin Portal',
    'nav.about': 'About & Safety',
    'nav.profile': 'My Profile',
    'nav.signIn': 'Sign In',
    'nav.signOut': 'Sign Out',
    'nav.donateNow': 'Donate Surplus Food',
    'nav.selectLanguage': 'Select Language',

    // Common Actions
    'action.donateFood': 'Donate Food',
    'action.claimDonation': 'Claim Donation',
    'action.assignVolunteer': 'Assign Volunteer',
    'action.startTracking': 'Start Live GPS Tracking',
    'action.stopTracking': 'Stop Live Tracking',
    'action.verifyQR': 'Scan Verification QR',
    'action.useMyLocation': 'Use My Current Location',
    'action.recenter': 'Recenter Map',
    'action.getDirections': 'Google Maps Directions',
    'action.smartMatch': 'Smart NGO Matching',
    'action.viewDetails': 'View Details',
    'action.cancel': 'Cancel',
    'action.confirm': 'Confirm',
    'action.close': 'Close',
    'action.refresh': 'Refresh',

    // Donation Statuses
    'status.available': 'Available for Rescue',
    'status.requested': 'Requested by NGO',
    'status.accepted': 'Accepted - Awaiting Courier',
    'status.scheduled': 'Courier Assigned',
    'status.picked_up': 'In Transit / Picked Up',
    'status.delivered': 'Delivered & Impact Verified',
    'status.cancelled': 'Cancelled',
    'status.expired': 'Expired',

    // Food Safety & Guidelines
    'safety.title': 'Food Safety Standards',
    'safety.twoHourRule': '2-Hour Temperature Rule: Cooked meals (5°C - 60°C) must be chilled or distributed within 2 hours.',
    'safety.hotHolding': 'Hot Holding: Maintain above 60°C.',
    'safety.coldStorage': 'Cold Storage: Perishables kept at 0°C to 4°C.',
    'safety.disclaimer': 'Always perform visual, odor, and temperature checks before accepting or consuming food.',

    // Verification
    'qr.pickupTitle': 'Pickup Handover QR Code',
    'qr.pickupInstruction': 'Show this QR code to the authorized volunteer at pickup location to verify handover.',
    'qr.deliveryTitle': 'Delivery Handover QR Code',
    'qr.deliveryInstruction': 'Show this QR code upon arrival at the shelter to confirm verified receipt.',
    'qr.scanPickup': 'Scan Pickup QR',
    'qr.scanDelivery': 'Scan Delivery QR',
    'qr.manualPin': 'Or enter 6-digit verification PIN:',
    'qr.verifiedSuccess': 'Verification confirmed successfully!',
    'qr.invalidToken': 'Invalid or expired verification token.',

    // Live Tracking
    'tracking.title': 'Live Volunteer Courier Tracking',
    'tracking.consentTitle': 'Share Live Location Consent',
    'tracking.consentText': 'Allow ResQBite to broadcast your live GPS coordinates during this active delivery? Location sharing will automatically stop once delivered.',
    'tracking.consentAgree': 'Agree & Start Broadcasting',
    'tracking.activeNotice': 'Broadcasting live device GPS to donor and recipient shelter.',
    'tracking.accuracy': 'GPS Accuracy',
    'tracking.lastUpdated': 'Last updated',

    // Impact
    'impact.title': 'Verified Community & Environmental Impact',
    'impact.subtitle': 'Real-time metrics calculated exclusively from confirmed delivered food rescue operations.',
    'impact.mealsRescued': 'Meals Rescued',
    'impact.kgDiverted': 'Food Rescued (kg)',
    'impact.co2Prevented': 'CO₂ Emissions Prevented (est.)',
    'impact.waterSaved': 'Water Conserved (est.)',
    'impact.activeDonations': 'Active Surpluses',
    'impact.successRate': 'Rescue Success Rate',

    // Mithra AI
    'mithra.name': 'Mithra AI',
    'mithra.tagline': 'Your intelligent companion for food rescue.',
    'mithra.placeholder': 'Ask Mithra about donations, GPS routing, safety rules...',
    'mithra.send': 'Send',
    'mithra.clear': 'Clear Chat',
    'mithra.typing': 'Mithra AI is thinking...',
  },

  kn: {
    // Navigation (Kannada)
    'nav.brand': 'ರೆಸ್ಕ್ಯೂಬೈಟ್',
    'nav.tagline': 'ಆಹಾರ ರಕ್ಷಣಾ ಜಾಲ',
    'nav.home': 'ಮುಖಪುಟ',
    'nav.browse': 'ಆಹಾರ ಹುಡುಕಿ',
    'nav.map': 'ಲೈವ್ ಜಿಪಿಎಸ್ ನಕ್ಷೆ',
    'nav.impact': 'ಪ್ರಭಾವ ವಿಶ್ಲೇಷಣೆ',
    'nav.organizations': 'ದೃಢೀಕೃತ ಎನ್‌ಜಿಒಗಳು',
    'nav.dashboard': 'ನನ್ನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    'nav.admin': 'ನಿರ್ವಾಹಕ ಪೋರ್ಟಲ್',
    'nav.about': 'ಸುರಕ್ಷತೆ ಮತ್ತು ಮಾಹಿತಿ',
    'nav.profile': 'ನನ್ನ ವಿವರ',
    'nav.signIn': 'ಸೈನ್ ಇನ್',
    'nav.signOut': 'ಸೈನ್ ಔಟ್',
    'nav.donateNow': 'ಹೆಚ್ಚುವರಿ ಆಹಾರ ದಾನ ಮಾಡಿ',
    'nav.selectLanguage': 'ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ',

    // Common Actions
    'action.donateFood': 'ಆಹಾರ ದಾನ ಮಾಡಿ',
    'action.claimDonation': 'ಆಹಾರ ಸ್ವೀಕರಿಸಿ',
    'action.assignVolunteer': 'ಸ್ವಯಂಸೇವಕರನ್ನು ನಿಯೋಜಿಸಿ',
    'action.startTracking': 'ಲೈವ್ ಟ್ರ್ಯಾಕಿಂಗ್ ಪ್ರಾರಂಭಿಸಿ',
    'action.stopTracking': 'ಟ್ರ್ಯಾಕಿಂಗ್ ನಿಲ್ಲಿಸಿ',
    'action.verifyQR': 'ಕ್ಯೂಆರ್ ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ',
    'action.useMyLocation': 'ನನ್ನ ಪ್ರಸ್ತುತ ಸ್ಥಳ ಬಳಸಿ',
    'action.recenter': 'ನಕ್ಷೆ ಕೇಂದ್ರೀಕರಿಸಿ',
    'action.getDirections': 'ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್ ಮಾರ್ಗ',
    'action.smartMatch': 'ಸ್ಮಾರ್ಟ್ ಎನ್‌ಜಿಒ ಹೊಂದಾಣಿಕೆ',
    'action.viewDetails': 'ವಿವರ ನೋಡಿ',
    'action.cancel': 'ರದ್ದುಮಾಡಿ',
    'action.confirm': 'ದೃಢೀಕರಿಸಿ',
    'action.close': 'ಮುಚ್ಚು',
    'action.refresh': 'ನವೀಕರಿಸಿ',

    // Donation Statuses
    'status.available': 'ರಕ್ಷಣೆಗೆ ಲಭ್ಯವಿದೆ',
    'status.requested': 'ಎನ್‌ಜಿಒ ವಿನಂತಿಸಿದೆ',
    'status.accepted': 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ - ಕಾಯುತ್ತಿದೆ',
    'status.scheduled': 'ಸ್ವಯಂಸೇವಕರು ನಿಯೋಜಿಸಲಾಗಿದೆ',
    'status.picked_up': 'ದಾರಿಯಲ್ಲಿದೆ / ಸಂಗ್ರಹಿಸಲಾಗಿದೆ',
    'status.delivered': 'ತಲುಪಿಸಲಾಗಿದೆ ಮತ್ತು ಪರಿಶೀಲಿಸಲಾಗಿದೆ',
    'status.cancelled': 'ರದ್ದುಮಾಡಲಾಗಿದೆ',
    'status.expired': 'ಅವಧಿ ಮೀರಿದೆ',

    // Food Safety & Guidelines
    'safety.title': 'ಆಹಾರ ಸುರಕ್ಷತಾ ಮಾನದಂಡಗಳು',
    'safety.twoHourRule': '೨-ಗಂಟೆಗಳ ನಿಯಮ: ಬೇಯಿಸಿದ ಆಹಾರವನ್ನು ೨ ಗಂಟೆಗಳ ಒಳಗೆ ತಂಪಾಗಿಸಬೇಕು ಅಥವಾ ವಿತರಿಸಬೇಕು.',
    'safety.hotHolding': 'ಬಿಸಿ ಆಹಾರ: ೬೦°C ಗಿಂತ ಹೆಚ್ಚು ಬಿಸಿಯಾಗಿಡಿ.',
    'safety.coldStorage': 'ತಂಪಾದ ಸಂಗ್ರಹಣೆ: ೦°C ನಿಂದ ೪°C ನಡುವೆ ಇಡಿ.',
    'safety.disclaimer': 'ಆಹಾರ ಸ್ವೀಕರಿಸುವ ಮುನ್ನ ವಾಸನೆ ಮತ್ತು ಗುಣಮಟ್ಟವನ್ನು ಯಾವಾಗಲೂ ಪರೀಕ್ಷಿಸಿ.',

    // Verification
    'qr.pickupTitle': 'ಸಂಗ್ರಹಣೆ ಕ್ಯೂಆರ್ ಕೋಡ್',
    'qr.pickupInstruction': 'ಆಹಾರ ನೀಡುವ ಸ್ಥಳದಲ್ಲಿ ಅಧಿಕೃತ ಸ್ವಯಂಸೇವಕರಿಗೆ ಈ ಕ್ಯೂಆರ್ ಕೋಡ್ ತೋರಿಸಿ.',
    'qr.deliveryTitle': 'ವಿತರಣೆ ಕ್ಯೂಆರ್ ಕೋಡ್',
    'qr.deliveryInstruction': 'ಆಶ್ರಮಕ್ಕೆ ತಲುಪಿದಾಗ ಸ್ವೀಕೃತಿ ದೃಢೀಕರಿಸಲು ಈ ಕೋಡ್ ತೋರಿಸಿ.',
    'qr.scanPickup': 'ಸಂಗ್ರಹಣೆ ಕ್ಯೂಆರ್ ಸ್ಕ್ಯಾನ್',
    'qr.scanDelivery': 'ವಿತರಣೆ ಕ್ಯೂಆರ್ ಸ್ಕ್ಯಾನ್',
    'qr.manualPin': 'ಅಥವಾ ೬-ಅಂಕಿಯ ಪಿನ್ ನಮೂದಿಸಿ:',
    'qr.verifiedSuccess': 'ಪರಿಶೀಲನೆ ಯಶಸ್ವಿಯಾಗಿದೆ!',
    'qr.invalidToken': 'ಅಮಾನ್ಯ ಅಥವಾ ಅವಧಿ ಮೀರಿದ ಕೋಡ್.',

    // Live Tracking
    'tracking.title': 'ಲೈವ್ ಸ್ವಯಂಸೇವಕ ಟ್ರ್ಯಾಕಿಂಗ್',
    'tracking.consentTitle': 'ಸ್ಥಳ ಹಂಚಿಕೆ ಅನುಮತಿ',
    'tracking.consentText': 'ಆಹಾರ ತಲುಪಿಸುವಾಗ ನಿಮ್ಮ ಲೈವ್ ಜಿಪಿಎಸ್ ಸ್ಥಳವನ್ನು ಹಂಚಿಕೊಳ್ಳಲು ಅನುಮತಿಸುತ್ತೀರಾ? ವಿತರಣೆ ಮುಗಿದ ನಂತರ ಟ್ರ್ಯಾಕಿಂಗ್ ತಾನಾಗಿಯೇ ನಿಲ್ಲುತ್ತದೆ.',
    'tracking.consentAgree': 'ಒಪ್ಪಿಗೆ ಮತ್ತು ಪ್ರಾರಂಭಿಸಿ',
    'tracking.activeNotice': 'ನಿಮ್ಮ ಸಾಧನದ ಜಿಪಿಎಸ್ ಸ್ಥಳವನ್ನು ಲೈವ್ ಆಗಿ ಪ್ರಸಾರ ಮಾಡಲಾಗುತ್ತಿದೆ.',
    'tracking.accuracy': 'ಜಿಪಿಎಸ್ ನಿಖರತೆ',
    'tracking.lastUpdated': 'ಕೊನೆಯ ನವೀಕರಣ',

    // Impact
    'impact.title': 'ದೃಢೀಕೃತ ಸಮುದಾಯ ಮತ್ತು ಪರಿಸರ ಪ್ರಭಾವ',
    'impact.subtitle': 'ತಲುಪಿಸಲಾದ ಆಹಾರ ಕಾರ್ಯಾಚರಣೆಗಳಿಂದ ಲೆಕ್ಕಹಾಕಲಾದ ನೈಜ ಅಂಕಿಅಂಶಗಳು.',
    'impact.mealsRescued': 'ಉಳಿಸಿದ ಊಟಗಳು',
    'impact.kgDiverted': 'ರಕ್ಷಿಸಿದ ಆಹಾರ (ಕೆಜಿ)',
    'impact.co2Prevented': 'ತಡೆಗಟ್ಟಿದ CO₂ ಹೊರಸೂಸುವಿಕೆ (ಅಂದಾಜು)',
    'impact.waterSaved': 'ಉಳಿಸಿದ ನೀರು (ಅಂದಾಜು)',
    'impact.activeDonations': 'ಲಭ್ಯವಿರುವ ಹೆಚ್ಚುವರಿ ಆಹಾರ',
    'impact.successRate': 'ಯಶಸ್ಸಿನ ದರ',

    // Mithra AI
    'mithra.name': 'ಮಿತ್ರ ಎಐ',
    'mithra.tagline': 'ಆಹಾರ ರಕ್ಷಣೆಯಲ್ಲಿ ನಿಮ್ಮ ಬುದ್ಧಿವಂತ ಒಡನಾಡಿ.',
    'mithra.placeholder': 'ದಾನ, ಜಿಪಿಎಸ್ ಮಾರ್ಗ, ಸುರಕ್ಷತೆ ಬಗ್ಗೆ ಮಿತ್ರರನ್ನು ಕೇಳಿ...',
    'mithra.send': 'ಕಳುಹಿಸಿ',
    'mithra.clear': 'ಚಾಟ್ ತೆರವುಗೊಳಿಸಿ',
    'mithra.typing': 'ಮಿತ್ರ ಎಐ ಯೋಚಿಸುತ್ತಿದೆ...',
  },

  hi: {
    // Navigation (Hindi)
    'nav.brand': 'रेस्क्यूबाइट',
    'nav.tagline': 'अन्न रक्षा नेटवर्क',
    'nav.home': 'होम',
    'nav.browse': 'भोजन खोजें',
    'nav.map': 'लाइव जीपीएस मैप',
    'nav.impact': 'प्रभाव विश्लेषण',
    'nav.organizations': 'सत्यापित एनजीओ',
    'nav.dashboard': 'मेरा डैशबोर्ड',
    'nav.admin': 'एडमिन पोर्टल',
    'nav.about': 'सुरक्षा और नियम',
    'nav.profile': 'मेरी प्रोफाइल',
    'nav.signIn': 'साइन इन',
    'nav.signOut': 'साइन आउट',
    'nav.donateNow': 'अतिरिक्त भोजन दान करें',
    'nav.selectLanguage': 'भाषा चुनें',

    // Common Actions
    'action.donateFood': 'भोजन दान करें',
    'action.claimDonation': 'भोजन स्वीकार करें',
    'action.assignVolunteer': 'स्वयंसेवक नियुक्त करें',
    'action.startTracking': 'लाइव जीपीएस ट्रैकिंग शुरू करें',
    'action.stopTracking': 'ट्रैकिंग बंद करें',
    'action.verifyQR': 'क्यूआर कोड स्कैन करें',
    'action.useMyLocation': 'मेरी वर्तमान लोकेशन का उपयोग करें',
    'action.recenter': 'मैप रीसेंटर करें',
    'action.getDirections': 'गूगल मैप्स दिशा-निर्देश',
    'action.smartMatch': 'स्मार्ट एनजीओ मिलान',
    'action.viewDetails': 'विवरण देखें',
    'action.cancel': 'रद्द करें',
    'action.confirm': 'पुष्टि करें',
    'action.close': 'बंद करें',
    'action.refresh': 'रिफ्रेश',

    // Donation Statuses
    'status.available': 'बचाव के लिए उपलब्ध',
    'status.requested': 'एनजीओ द्वारा अनुरोधित',
    'status.accepted': 'स्वीकृत - पिकअप की प्रतीक्षा',
    'status.scheduled': 'स्वयंसेवक नियुक्त',
    'status.picked_up': 'रास्ते में / पिकअप संपन्न',
    'status.delivered': 'सफलतापूर्वक वितरित',
    'status.cancelled': 'रद्द किया गया',
    'status.expired': 'समय समाप्त',

    // Food Safety & Guidelines
    'safety.title': 'खाद्य सुरक्षा मानक',
    'safety.twoHourRule': '२ घंटे का तापमान नियम: पके हुए भोजन को २ घंटे के भीतर ठंडा या वितरित किया जाना चाहिए।',
    'safety.hotHolding': 'गर्म भोजन: ६०°C से ऊपर तापमान रखें।',
    'safety.coldStorage': 'कोल्ड स्टोरेज: ०°C से ४°C के बीच रखें।',
    'safety.disclaimer': 'भोजन स्वीकार करने से पहले गंध, बनावट और तापमान की जांच अवश्य करें।',

    // Verification
    'qr.pickupTitle': 'पिकअप सत्यापन क्यूआर कोड',
    'qr.pickupInstruction': 'भोजन सौंपते समय अधिकृत स्वयंसेवक को यह क्यूआर कोड दिखाएं।',
    'qr.deliveryTitle': 'वितरण सत्यापन क्यूआर कोड',
    'qr.deliveryInstruction': 'आश्रय स्थल पर डिलीवरी की पुष्टि करने के लिए यह कोड दिखाएं।',
    'qr.scanPickup': 'पिकअप क्यूआर स्कैन करें',
    'qr.scanDelivery': 'वितरण क्यूआर स्कैन करें',
    'qr.manualPin': 'या ६ अंकों का सुरक्षा पिन दर्ज करें:',
    'qr.verifiedSuccess': 'सत्यापन सफलतापूर्वक संपन्न हुआ!',
    'qr.invalidToken': 'अमान्य या समाप्त टोकन।',

    // Live Tracking
    'tracking.title': 'लाइव स्वयंसेवक ट्रैकिंग',
    'tracking.consentTitle': 'लोकेशन साझा करने की सहमति',
    'tracking.consentText': 'क्या आप इस सक्रिय डिलीवरी के दौरान अपनी वास्तविक जीपीएस लोकेशन साझा करने की अनुमति देते हैं? डिलीवरी पूर्ण होने पर ट्रैकिंग अपने आप बंद हो जाएगी।',
    'tracking.consentAgree': 'सहमति दें और शुरू करें',
    'tracking.activeNotice': 'डोनर और आश्रम को आपकी लाइव जीपीएस लोकेशन दिखाई दे रही है।',
    'tracking.accuracy': 'जीपीएस सटीकता',
    'tracking.lastUpdated': 'अंतिम अपडेट',

    // Impact
    'impact.title': 'सत्यापित सामाजिक एवं पर्यावरणीय प्रभाव',
    'impact.subtitle': 'केवल पुष्टि की गई खाद्य बचाव गतिविधियों से प्राप्त वास्तविक आंकड़े।',
    'impact.mealsRescued': 'बचाए गए भोजन',
    'impact.kgDiverted': 'बचाया गया अन्न (किग्रा)',
    'impact.co2Prevented': 'रोका गया CO₂ उत्सर्जन (अनुमानित)',
    'impact.waterSaved': 'बचाया गया पानी (अनुमानित)',
    'impact.activeDonations': 'सक्रिय उपलब्ध भोजन',
    'impact.successRate': 'सफलता दर',

    // Mithra AI
    'mithra.name': 'मित्रा एआई',
    'mithra.tagline': 'भोजन बचाव में आपका बुद्धिमान साथी।',
    'mithra.placeholder': 'दान, जीपीएस रूट, खाद्य सुरक्षा के बारे में मित्रा से पूछें...',
    'mithra.send': 'भेजें',
    'mithra.clear': 'चैट साफ करें',
    'mithra.typing': 'मित्रा एआई सोच रहा है...',
  },

  ta: {
    // Navigation (Tamil)
    'nav.brand': 'ரெஸ்க்யூபைட்',
    'nav.tagline': 'உணவு மீட்பு நெட்வொர்க்',
    'nav.home': 'முகப்பு',
    'nav.browse': 'உணவை தேடுங்கள்',
    'nav.map': 'நேரலை ஜிபிஎஸ் வரைபடம்',
    'nav.impact': 'தாக்க பகுப்பாய்வு',
    'nav.organizations': 'சரிபார்க்கப்பட்ட என்ஜிஓக்கள்',
    'nav.dashboard': 'என் கட்டுப்பாட்டகம்',
    'nav.admin': 'நிர்வாக போர்டல்',
    'nav.about': 'பாதுகாப்பு & விதிமுறைகள்',
    'nav.profile': 'சுயவிவரம்',
    'nav.signIn': 'உள்நுழைக',
    'nav.signOut': 'வெளியேறு',
    'nav.donateNow': 'மீதமுள்ள உணவை தானம் செய்',
    'nav.selectLanguage': 'மொழியைத் தேர்ந்தெடுக்கவும்',

    // Common Actions
    'action.donateFood': 'உணவு தானம் செய்',
    'action.claimDonation': 'உணவை பெறுக',
    'action.assignVolunteer': 'தன்னார்வலரை நியமிக்கவும்',
    'action.startTracking': 'நேரலை ஜிபிஎஸ் கண்காணிப்பு',
    'action.stopTracking': 'கண்காணிப்பை நிறுத்து',
    'action.verifyQR': 'QR குறியீட்டை ஸ்கேன் செய்',
    'action.useMyLocation': 'எனது தற்போதைய இடத்தை பயன்படுத்து',
    'action.recenter': 'வரைபடத்தை மையப்படுத்து',
    'action.getDirections': 'கூகிள் வரைபட வழிகாட்டுதல்',
    'action.smartMatch': 'ஸ்மார்ட் என்ஜிஓ பொருத்தம்',
    'action.viewDetails': 'விவரங்களை காண்க',
    'action.cancel': 'ரத்துசெய்',
    'action.confirm': 'உறுதிசெய்',
    'action.close': 'மூடு',
    'action.refresh': 'புதுப்பி',

    // Donation Statuses
    'status.available': 'மீட்புக்கு கிடைக்கிறது',
    'status.requested': 'என்ஜிஓ கோரியுள்ளது',
    'status.accepted': 'ஏற்றுக்கொள்ளப்பட்டது - காத்திருக்கிறது',
    'status.scheduled': 'தன்னார்வலர் நியமிக்கப்பட்டார்',
    'status.picked_up': 'வழியில் உள்ளது / பெறப்பட்டது',
    'status.delivered': 'ஒப்படைக்கப்பட்டது & சரிபார்க்கப்பட்டது',
    'status.cancelled': 'ரத்து செய்யப்பட்டது',
    'status.expired': 'காலாவதியானது',

    // Food Safety & Guidelines
    'safety.title': 'உணவு பாதுகாப்பு நெறிமுறைகள்',
    'safety.twoHourRule': '2 மணி நேர விதி: சமைத்த உணவை 2 மணி நேரத்திற்குள் குளிரூட்ட வேண்டும் அல்லது விநியோகிக்க வேண்டும்.',
    'safety.hotHolding': 'சூடான உணவு: 60°C க்கும் மேல் சூடாக வைக்கவும்.',
    'safety.coldStorage': 'குளிர்ந்த சேமிப்பு: 0°C முதல் 4°C வரை பராமரிக்கவும்.',
    'safety.disclaimer': 'உணவை ஏற்கும் முன் வாசனை மற்றும் வெப்பநிலையை எப்போதும் சரிபார்க்கவும்.',

    // Verification
    'qr.pickupTitle': 'பிக்அப் சரிபார்ப்பு QR குறியீடு',
    'qr.pickupInstruction': 'உணவை ஒப்படைக்கும் போது தன்னார்வலருக்கு இந்த QR குறியீட்டைக் காட்டவும்.',
    'qr.deliveryTitle': 'டெலிவரி சரிபார்ப்பு QR குறியீடு',
    'qr.deliveryInstruction': 'காப்பகத்தில் டெலிவரியை உறுதிப்படுத்த இந்த குறியீட்டைக் காட்டவும்.',
    'qr.scanPickup': 'பிக்அப் QR ஸ்கேன்',
    'qr.scanDelivery': 'டெலிவரி QR ஸ்கேன்',
    'qr.manualPin': 'அல்லது 6 இலக்க பின்னை உள்ளிடவும்:',
    'qr.verifiedSuccess': 'சரிபார்ப்பு வெற்றிகரமாக முடிந்தது!',
    'qr.invalidToken': 'தவறான அல்லது காலாவதியான குறியீடு.',

    // Live Tracking
    'tracking.title': 'நேரலை தன்னார்வலர் கண்காணிப்பு',
    'tracking.consentTitle': 'இடம் பகிர்வு ஒப்புதல்',
    'tracking.consentText': 'டெலிவரியின் போது உங்கள் நேரலை ஜிபிஎஸ் இடத்தை பகிர ஒப்புக்கொள்கிறீர்களா? ஒப்படைத்த பின் தானாகவே நின்றுவிடும்.',
    'tracking.consentAgree': 'ஒப்புக்கொண்டு தொடங்கவும்',
    'tracking.activeNotice': 'உங்கள் நேரலை ஜிபிஎஸ் இடம் பகிரப்படுகிறது.',
    'tracking.accuracy': 'ஜிபிஎஸ் துல்லியம்',
    'tracking.lastUpdated': 'கடைசி புதுப்பிப்பு',

    // Impact
    'impact.title': 'சரிபார்க்கப்பட்ட சமூக மற்றும் சுற்றுச்சூழல் தாக்கம்',
    'impact.subtitle': 'உறுதிசெய்யப்பட்ட உணவு மீட்பு பணிகளின் உண்மையான புள்ளிவிவரங்கள்.',
    'impact.mealsRescued': 'மீட்கப்பட்ட உணவுகள்',
    'impact.kgDiverted': 'மீட்கப்பட்ட உணவு (கிலோ)',
    'impact.co2Prevented': 'தடுக்கப்பட்ட CO₂ உமிழ்வு (மதிப்பீடு)',
    'impact.waterSaved': 'சேமிக்கப்பட்ட நீர் (மதிப்பீடு)',
    'impact.activeDonations': 'கிடைக்கும் உபரி உணவு',
    'impact.successRate': 'வெற்றி விகிதம்',

    // Mithra AI
    'mithra.name': 'மித்ரா ஏஐ',
    'mithra.tagline': 'உணவு மீட்பில் உங்கள் புத்திசாலி தோழன்.',
    'mithra.placeholder': 'தானம், ஜிபிஎஸ் பாதை, பாதுகாப்பு பற்றி மித்ராவிடம் கேளுங்கள்...',
    'mithra.send': 'அனுப்புக',
    'mithra.clear': 'அரட்டையை அழி',
    'mithra.typing': 'மித்ரா ஏஐ யோசிக்கிறது...',
  },
};
