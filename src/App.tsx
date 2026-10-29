import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingView } from './components/LandingView';
import { BrowseDonationsView } from './components/BrowseDonationsView';
import { RescueMapView } from './components/RescueMapView';
import { DashboardView } from './components/DashboardView';
import { OrganizationsView } from './components/OrganizationsView';
import { ImpactAnalyticsView } from './components/ImpactAnalyticsView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AuthView } from './components/AuthView';
import { AboutView } from './components/AboutView';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { VolunteerView } from './components/VolunteerView';
import { CreateDonationModal } from './components/CreateDonationModal';
import { DonationDetailModal } from './components/DonationDetailModal';
import { MithraChatbot } from './components/MithraChatbot';
import { Donation } from './types';
import { subscribeDonations, createDonation, registerOrganization } from './services/dbService';
import { testConnection } from './lib/firebase';
import { Loader2, Sparkles, Database, CheckCircle2 } from 'lucide-react';

function AppContent() {
  const { currentUser, userProfile, loading: authLoading } = useAuth();

  const [currentTab, setCurrentTab] = useState<string>('home');
  const [authInitialRole, setAuthInitialRole] = useState<'donor' | 'volunteer' | null>(null);
  const [pendingOpenCreate, setPendingOpenCreate] = useState(false);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  // Initialize and subscribe to Firestore donations
  useEffect(() => {
    testConnection().then((connected) => {
      setDbConnected(connected);
    });

    const unsubscribe = subscribeDonations((list) => {
      setDonations(list);
      setLoadingDonations(false);
    });

    return () => {
      unsubscribe && unsubscribe();
    };
  }, []);

  // Sync selected donation if updated in real-time
  useEffect(() => {
    if (selectedDonation) {
      const fresh = donations.find((d) => d.id === selectedDonation.id);
      if (fresh) {
        setSelectedDonation(fresh);
      }
    }
  }, [donations]);

  // Seed sample data directly into Cloud Firestore for Hackathon Demonstration
  const handleSeedInitialData = async () => {
    if (!currentUser) {
      alert('Please sign in first to seed initial demonstrations into Firestore.');
      setCurrentTab('auth');
      return;
    }

    setSeedingLoading(true);
    try {
      // 1. Create a few diverse donations in Firestore
      await createDonation({
        donorId: currentUser.uid,
        donorName: 'Grand Hyatt Catering',
        foodName: '60 Pax Paneer Butter Masala with Jeera Rice & Naan',
        category: 'Cooked Meals',
        description: 'Surplus from high-end corporate luncheon buffet. Untouched in hot-holding units, sealed in commercial stainless containers.',
        quantity: 60,
        unit: 'servings',
        servings: 60,
        prepTime: 'Prepared at 1:00 PM',
        pickupDeadline: 'Today before 6:00 PM',
        pickupAddress: 'Grand Hyatt Regency, Sector 29, City Center',
        latitude: 28.6289,
        longitude: 77.2185,
        storageType: 'Hot Holding (> 60°C)',
        packaging: 'Sealed food-grade containers',
        allergens: 'Dairy (Paneer, Butter), Gluten (Naan)',
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
        status: 'available',
      });

      await createDonation({
        donorId: currentUser.uid,
        donorName: 'Artisan Bakery Co.',
        foodName: '40 Fresh Multigrain Loaves & Baguettes',
        category: 'Bakery & Bread',
        description: 'Baked this morning at 6 AM. Sealed in sanitized bakery paper wraps. Ideal for breakfast shelter distribution.',
        quantity: 40,
        unit: 'boxes',
        servings: 80,
        prepTime: 'Baked today 6:30 AM',
        pickupDeadline: 'Today before 8:00 PM',
        pickupAddress: 'Shop 14, Main Market, South Extension',
        latitude: 28.5729,
        longitude: 77.2215,
        storageType: 'Room Temperature (Dry)',
        packaging: 'Aluminium foil trays / wraps',
        allergens: 'Gluten, Wheat',
        imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
        status: 'available',
      });

      await createDonation({
        donorId: currentUser.uid,
        donorName: 'Green Farm Supermarket',
        foodName: '25 kg Fresh Apples, Bananas & Seasonal Melons',
        category: 'Fresh Produce & Fruits',
        description: 'Grade-A fruit surplus from daily inventory intake. Packed in ventilated wooden crates.',
        quantity: 25,
        unit: 'kg',
        servings: 60,
        prepTime: 'Sorted at 10:00 AM',
        pickupDeadline: 'Tomorrow before 12:00 PM',
        pickupAddress: 'Fresh Hub Warehouse, Industrial Belt, Block C',
        latitude: 28.6505,
        longitude: 77.1950,
        storageType: 'Room Temperature (Dry)',
        packaging: 'Crates / Boxes with breathable cover',
        allergens: 'None',
        imageUrl: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80',
        status: 'available',
      });

      // 2. Register initial NGO
      await registerOrganization({
        ownerUid: currentUser.uid,
        name: 'Asha Community Shelter & Kitchen',
        registrationNumber: 'NGO-DEL-2024-9182',
        type: 'Homeless Shelter & Feeding Center',
        contactEmail: currentUser.email || 'asha@foodrescue.org',
        contactPhone: '+91 98111 22334',
        address: 'Building 4, Sector 7, Rohini',
        city: 'New Delhi',
        capacityDailyMeals: 350,
      });

      alert('Initial demonstration listings successfully persisted into Firestore!');
    } catch (err: any) {
      alert(`Seeding failed: ${err.message}`);
    } finally {
      setSeedingLoading(false);
    }
  };

  const handleOpenCreateDonation = () => {
    if (!currentUser) {
      setAuthInitialRole('donor');
      setPendingOpenCreate(true);
      setCurrentTab('auth');
      return;
    }
    setCreateModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-stone-50/50 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenCreateDonation={handleOpenCreateDonation}
        onSelectRoleBeforeLogin={(role) => {
          setAuthInitialRole(role);
        }}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {/* Empty state alert with Firestore Seeding Helper for evaluators */}
        {donations.length === 0 && !loadingDonations && currentTab !== 'auth' && (
          <div className="max-w-4xl mx-auto my-6 px-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-emerald-700 shrink-0" />
                <div className="text-xs text-emerald-950">
                  <span className="font-bold">Live Cloud Firestore Connected:</span> Database currently contains 0 records. Click to seed realistic demo listings into Firestore for instant evaluation.
                </div>
              </div>
              <button
                onClick={handleSeedInitialData}
                disabled={seedingLoading}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2 rounded-xl shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {seedingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                Seed Demo Surplus to Firestore
              </button>
            </div>
          </div>
        )}

        {/* If user is on 'auth' tab, OR unauthenticated on 'home' (Welcome Page), OR authenticated without a role */}
        {(currentTab === 'auth' ||
          (!currentUser && !authLoading && currentTab === 'home') ||
          (currentUser && !authLoading && !userProfile?.role)) ? (
          <AuthView
            initialRole={authInitialRole}
            onSuccess={(targetDashboard) => {
              const dest =
                targetDashboard ||
                (userProfile?.role === 'volunteer' ? 'volunteer' : 'dashboard');
              setCurrentTab(dest);
              if (pendingOpenCreate && (dest === 'dashboard' || dest === 'home')) {
                setCreateModalOpen(true);
                setPendingOpenCreate(false);
              }
            }}
            onNavigateTab={setCurrentTab}
          />
        ) : (
          <>
            {currentTab === 'home' && (
              <LandingView
                donations={donations}
                onNavigate={setCurrentTab}
                onOpenCreate={handleOpenCreateDonation}
                onSelectDonation={(d) => setSelectedDonation(d)}
              />
            )}

            {currentTab === 'browse' && (
              <BrowseDonationsView
                donations={donations}
                onSelectDonation={(d) => setSelectedDonation(d)}
                onOpenCreate={handleOpenCreateDonation}
              />
            )}

            {currentTab === 'map' && (
              <RescueMapView
                donations={donations}
                onSelectDonation={(d) => setSelectedDonation(d)}
                onOpenCreate={handleOpenCreateDonation}
              />
            )}

            {currentTab === 'dashboard' && (
              <DashboardView
                donations={donations}
                onSelectDonation={(d) => setSelectedDonation(d)}
                onOpenCreate={handleOpenCreateDonation}
                onNavigate={setCurrentTab}
              />
            )}

            {currentTab === 'organizations' && <OrganizationsView />}

            {currentTab === 'impact' && <ImpactAnalyticsView donations={donations} />}

            {currentTab === 'volunteer' && (
              <VolunteerView
                donations={donations}
                onSelectDonation={(d) => setSelectedDonation(d)}
                onNavigateTab={setCurrentTab}
              />
            )}

            {currentTab === 'admin' && (
              <AdminDashboardView
                donations={donations}
                onSelectDonation={(d) => setSelectedDonation(d)}
              />
            )}

            {currentTab === 'about' && <AboutView />}

            {currentTab === 'profile' && <ProfileSettingsView />}
          </>
        )}
      </main>

      {/* Modals */}
      <CreateDonationModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCurrentTab('browse');
        }}
      />

      <DonationDetailModal
        donation={selectedDonation}
        onClose={() => setSelectedDonation(null)}
        onRefresh={() => {
          // Handled via real-time subscription
        }}
      />

      {/* Mithra AI Intelligent Chatbot */}
      <MithraChatbot
        onNavigate={setCurrentTab}
        onOpenCreateDonation={handleOpenCreateDonation}
        onSelectDonation={(d) => setSelectedDonation(d)}
        donations={donations}
        userProfile={userProfile}
        onSeedDemo={handleSeedInitialData}
      />

      <Footer onNavigate={setCurrentTab} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  );
}
