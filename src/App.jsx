import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";
const api = axios.create({ baseURL: API_URL });
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(Number(value || 0));
const today = () => new Date().toLocaleDateString("en-CA");
const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return date.toLocaleDateString("en-CA"); };

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("driveease_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function App() {
  const [page, setPage] = useState("home");
  const [vehicles, setVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("driveease_user") || "null"); }
    catch { return null; }
  });
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [sort, setSort] = useState("recommended");
  const [notice, setNotice] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const notify = (text, type = "success") => {
    setNotice({ text, type });
    window.setTimeout(() => setNotice({ text: "", type: "" }), 4200);
  };

  const loadVehicles = useCallback(async () => {
    try {
      const { data } = await api.get("/vehicles");
      setVehicles(Array.isArray(data) ? data : []);
    } catch {
      setVehicles([]);
      notify("Could not connect to the backend. Start Spring Boot and MongoDB, then refresh.", "error");
    }
  }, []);

  const loadBookings = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/bookings/my");
      setBookings(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.response?.data?.error || "Unable to load bookings. Please sign in again.", "error");
    }
  }, [user]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);
  useEffect(() => {
    if (page === "bookings") loadBookings();
  }, [page, loadBookings]);

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = vehicles.filter((v) => {
      const matchesSearch = [v.brand, v.model, v.type, v.fuelType].some((x) => String(x || "").toLowerCase().includes(q));
      return matchesSearch && (filterType === "All" || v.type === filterType);
    });
    if (sort === "low") result.sort((a, b) => a.pricePerDay - b.pricePerDay);
    if (sort === "high") result.sort((a, b) => b.pricePerDay - a.pricePerDay);
    return result;
  }, [vehicles, search, filterType, sort]);

  const go = (target) => {
    setNotice({ text: "", type: "" });
    setPage(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const logout = () => {
    localStorage.removeItem("driveease_token");
    localStorage.removeItem("driveease_user");
    setUser(null);
    setBookings([]);
    setSelectedVehicle(null);
    notify("You have been signed out.");
    go("home");
  };

  const handleAuth = async (event, mode) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    setLoading(true);
    try {
      if (mode === "register") {
        await api.post("/auth/register", { name: payload.name, email: payload.email, password: payload.password });
        notify("Account created successfully. Sign in to continue.");
        go("login");
      } else {
        const { data } = await api.post("/auth/login", { email: payload.email, password: payload.password });
        localStorage.setItem("driveease_token", data.token);
        const currentUser = { id: data.id, name: data.name, email: data.email, role: data.role || "USER" };
        localStorage.setItem("driveease_user", JSON.stringify(currentUser));
        setUser(currentUser);
        notify(`Welcome back, ${data.name || "driver"}!`);
        go("vehicles");
      }
    } catch (error) {
      notify(error.response?.data?.error || error.response?.data?.message || "Request failed. Check the backend and try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const startBooking = (vehicle) => {
    if (!user) {
      setSelectedVehicle(vehicle);
      notify("Please sign in before booking.", "error");
      go("login");
      return;
    }
    setSelectedVehicle(vehicle);
    go("book");
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!selectedVehicle) return;
    const form = new FormData(event.currentTarget);
    const startDate = form.get("startDate");
    const endDate = form.get("endDate");
    setLoading(true);
    try {
      const { data } = await api.post("/bookings", {
        vehicleId: selectedVehicle.id, startDate, endDate,
      });
      notify(`Booking request submitted. Reference: ${data.id}`);
      setSelectedVehicle(null);
      go("bookings");
    } catch (error) {
      notify(error.response?.data?.error || "Booking could not be created. Please check the dates and try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const createVehicle = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    payload.pricePerDay = Number(payload.pricePerDay);
    payload.seats = Number(payload.seats);
    payload.available = true;
    setLoading(true);
    try {
      await api.post("/vehicles", payload);
      formElement.reset();
      notify("Vehicle added to the collection.");
      await loadVehicles();
    } catch (error) {
      notify(error.response?.data?.error || "Could not add vehicle. Make sure you are signed in as an admin.", "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteVehicle = async (id) => {
    if (!window.confirm("Delete this vehicle from the collection?")) return;
    try {
      await api.delete(`/vehicles/${id}`);
      notify("Vehicle removed.");
      loadVehicles();
    } catch (error) {
      notify(error.response?.data?.error || "Could not delete vehicle. Admin access is required.", "error");
    }
  };

  const cancelBooking = async (id) => {
    if (!window.confirm("Cancel this booking request?")) return;
    try {
      await api.patch(`/bookings/${id}/cancel`);
      notify("Booking cancelled.");
      loadBookings();
    } catch (error) {
      notify(error.response?.data?.error || "Could not cancel this booking.", "error");
    }
  };

  const vehicleTypes = ["All", ...new Set(vehicles.map((v) => v.type).filter(Boolean))];

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => go("home")} aria-label="DriveEase home">
          <span className="brand-mark">D</span>
          <span>drive<span className="brand-accent">ease</span><small>YOUR JOURNEY, SIMPLIFIED</small></span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={page === "home" ? "nav-link active" : "nav-link"} onClick={() => go("home")}>Home</button>
          <button className={page === "vehicles" || page === "book" ? "nav-link active" : "nav-link"} onClick={() => go("vehicles")}>Explore cars</button>
          {user && <button className={page === "bookings" ? "nav-link active" : "nav-link"} onClick={() => go("bookings")}>My bookings</button>}
          {user?.role === "ADMIN" && <button className={page === "admin" ? "nav-link active" : "nav-link"} onClick={() => go("admin")}>Admin</button>}
        </nav>
        <div className="nav-actions">
          {user ? <>
            <span className="user-greeting">Hi, {user.name?.split(" ")[0] || "Driver"}</span>
            <button className="button button-outline button-small" onClick={logout}>Sign out</button>
          </> : <>
            <button className="button button-quiet button-small" onClick={() => go("login")}>Sign in</button>
            <button className="button button-dark button-small" onClick={() => go("register")}>Create account <span aria-hidden="true">↗</span></button>
          </>}
        </div>
      </header>

      {notice.text && <div className={`notice ${notice.type}`} role="status">
        <span>{notice.type === "error" ? "!" : "✓"}</span>{notice.text}
        <button onClick={() => setNotice({ text: "", type: "" })} aria-label="Dismiss notification">×</button>
      </div>}

      <main>
        {page === "home" && <HomePage onExplore={() => go("vehicles")} onRegister={() => go(user ? "vehicles" : "register")} onBookVehicle={startBooking} vehicles={vehicles} />}
        {page === "vehicles" && <section className="section page-section">
          <div className="eyebrow">THE DRIVE EASE COLLECTION</div>
          <div className="section-heading-row">
            <div><h1>Find your <em>perfect ride.</em></h1><p className="muted">From quick city trips to weekend escapes, your next drive starts here.</p></div>
            <span className="result-count">{filteredVehicles.length} vehicles</span>
          </div>
          <div className="filters">
            <label className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search make, model or fuel..." /></label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Filter by vehicle type">
              {vehicleTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort vehicles">
              <option value="recommended">Recommended</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option>
            </select>
          </div>
          {filteredVehicles.length ? <div className="vehicle-grid">
            {filteredVehicles.map((vehicle, index) => <VehicleCard key={vehicle.id || index} vehicle={vehicle} onBook={() => startBooking(vehicle)} />)}
          </div> : <div className="empty-state"><div className="empty-icon">⌕</div><h3>No vehicles found</h3><p>Try another search or change the filters.</p><button className="button button-dark" onClick={() => { setSearch(""); setFilterType("All"); }}>Clear filters</button></div>}
        </section>}

        {(page === "login" || page === "register") && <AuthPage mode={page} onSubmit={handleAuth} loading={loading} onSwitch={(target) => go(target)} />}
        {page === "book" && selectedVehicle && <section className="section page-section booking-layout">
          <div className="booking-intro"><button className="back-link" onClick={() => go("vehicles")}>← Back to cars</button><div className="eyebrow">RESERVE YOUR RIDE</div><h1>One step closer to <em>the open road.</em></h1><p className="muted">Choose your dates and we’ll take care of the details.</p>
            <VehicleCard vehicle={selectedVehicle} compact onBook={() => {}} />
          </div>
          <form className="panel booking-form" onSubmit={submitBooking}>
            <div className="panel-heading"><span className="step-number">01</span><div><h2>Your trip dates</h2><p>Choose pickup and return dates.</p></div></div>
            <label>Pickup date<input type="date" name="startDate" min={today()} defaultValue={today()} required /></label>
            <label>Return date<input type="date" name="endDate" min={tomorrow()} defaultValue={tomorrow()} required /></label>
            <div className="booking-note"><span>i</span><p>Bookings are requests and start with <strong>Pending</strong> status. Final cost is calculated by the server.</p></div>
            <button className="button button-dark button-wide" disabled={loading}>{loading ? "Submitting..." : "Request booking"} <span>↗</span></button>
            <p className="secure-note">✓ Secure booking · No payment collected online</p>
          </form>
        </section>}
        {page === "book" && !selectedVehicle && <div className="empty-state"><h3>Select a vehicle first</h3><button className="button button-dark" onClick={() => go("vehicles")}>Explore vehicles</button></div>}

        {page === "admin" && user?.role === "ADMIN" && <section className="section page-section">
          <div className="eyebrow">FLEET CONTROL</div><div className="section-heading-row"><div><h1>Manage the <em>fleet.</em></h1><p className="muted">Add vehicles and keep the DriveEase collection up to date.</p></div><span className="result-count">{vehicles.length} vehicles listed</span></div>
          <form className="panel admin-form" onSubmit={createVehicle}>
            <div className="panel-heading"><span className="step-number">+</span><div><h2>Add a vehicle</h2><p>Fields marked required must be filled in.</p></div></div>
            <div className="admin-fields">
              <label>Brand<input name="brand" placeholder="e.g. Hyundai" required /></label>
              <label>Model<input name="model" placeholder="e.g. Creta" required /></label>
              <label>Vehicle type<select name="type" defaultValue="SUV"><option>SUV</option><option>Hatchback</option><option>Sedan</option><option>MUV</option><option>Electric</option><option>Luxury</option></select></label>
              <label>Registration number<input name="registrationNumber" placeholder="TS 09 AB 1234" required /></label>
              <label>Price per day (₹)<input name="pricePerDay" type="number" min="1" placeholder="2500" required /></label>
              <label>Fuel type<select name="fuelType" defaultValue="Petrol"><option>Petrol</option><option>Diesel</option><option>Electric</option><option>Hybrid</option><option>CNG</option></select></label>
              <label>Seats<input name="seats" type="number" min="1" max="20" defaultValue="5" required /></label>
              <label>Transmission<select name="transmission" defaultValue="Automatic"><option>Automatic</option><option>Manual</option></select></label>
              <label className="admin-image-field">Image URL<input name="imageUrl" type="url" placeholder="https://..." /></label>
            </div>
            <button className="button button-dark" disabled={loading}>{loading ? "Saving…" : "Add vehicle"} <span>↗</span></button>
          </form>
          <div className="admin-vehicle-list">{vehicles.map((v) => <div className="admin-vehicle-row" key={v.id}><div><strong>{v.brand} {v.model}</strong><small>{v.registrationNumber} · {money(v.pricePerDay)}/day</small></div><button className="text-button danger-text" onClick={() => deleteVehicle(v.id)}>Delete</button></div>)}</div>
        </section>}
        {page === "admin" && user?.role !== "ADMIN" && <div className="empty-state"><h3>Admin access required</h3><p>Sign in with an administrator account to manage the fleet.</p><button className="button button-dark" onClick={() => go("home")}>Back to home</button></div>}

        {page === "bookings" && <section className="section page-section">
          <div className="eyebrow">YOUR DRIVE EASE ACCOUNT</div><div className="section-heading-row"><div><h1>Your <em>journeys.</em></h1><p className="muted">Track your reservations and keep your plans in one place.</p></div><button className="button button-dark" onClick={() => go("vehicles")}>+ Book a car</button></div>
          {bookings.length ? <div className="booking-list">{bookings.slice().sort((a,b) => String(b.startDate).localeCompare(String(a.startDate))).map((booking) => {
            const vehicle = vehicles.find((v) => v.id === booking.vehicleId);
            return <article className="booking-card" key={booking.id}>
              <div className="booking-car-thumb">{vehicle?.imageUrl ? <img src={vehicle.imageUrl} alt={`${vehicle.brand} ${vehicle.model}`} /> : <span>🚘</span>}</div>
              <div className="booking-main"><div className="booking-title-row"><h3>{vehicle ? `${vehicle.brand} ${vehicle.model}` : "Vehicle reservation"}</h3><span className={`status status-${String(booking.status || "PENDING").toLowerCase()}`}>{booking.status || "PENDING"}</span></div><p className="muted">{booking.startDate} <span className="date-arrow">→</span> {booking.endDate}</p><small>Booking ID: {booking.id}</small></div>
              <div className="booking-total"><span>Total price</span><strong>{money(booking.totalPrice)}</strong>{booking.status !== "CANCELLED" && <button className="text-button danger-text" onClick={() => cancelBooking(booking.id)}>Cancel booking</button>}</div>
            </article>;
          })}</div> : <div className="empty-state"><div className="empty-icon">↗</div><h3>Your next adventure starts here</h3><p>You haven’t made a booking yet. Explore the collection to find your ride.</p><button className="button button-dark" onClick={() => go("vehicles")}>Explore vehicles</button></div>}
        </section>}
      </main>

      <footer className="footer">
        <div className="footer-brand"><span className="brand-mark">D</span><span>drive<span className="brand-accent">ease</span></span></div>
        <p>Good drives. Great memories. Every time.</p>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} DriveEase</span><span>Made for the road ahead <span className="footer-heart">♥</span></span></div>
      </footer>
    </div>
  );
}

function HomePage({ onExplore, onRegister, onBookVehicle, vehicles }) {
  return <div className="home-page">
    <section className="hero">
      <div className="hero-image" role="img" aria-label="Car on an open road" />
      <div className="hero-shade" />
      <div className="hero-content">
        <div className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> THE ROAD IS YOURS</div>
        <h1>More than a ride.<br />It's <em>your freedom.</em></h1>
        <p>Find the right car for every plan. Easy booking, transparent pricing, and the freedom to go wherever life takes you.</p>
        <div className="hero-actions"><button className="button button-lime" onClick={onExplore}>Explore our cars <span>↗</span></button><button className="hero-text-button" onClick={onRegister}>Get started <span>→</span></button></div>
        <div className="hero-proof"><div className="proof-avatars"><span>J</span><span>A</span><span>M</span></div><div><strong>Made for every journey</strong><small>Simple, flexible, and ready when you are.</small></div></div>
      </div>
      <div className="hero-side-label">DRIVE YOUR WAY · DRIVE EASE</div>
      <div className="hero-bottom-note"><span>01 / 03</span><span>YOUR NEXT CHAPTER STARTS HERE</span></div>
    </section>
    <section className="trust-strip">
      <div><span className="trust-icon">✦</span><span><strong>Easy reservations</strong><small>Book in just a few clicks</small></span></div>
      <div><span className="trust-icon">₹</span><span><strong>Clear daily pricing</strong><small>No hidden rental rates</small></span></div>
      <div><span className="trust-icon">⌁</span><span><strong>Cars for every plan</strong><small>City drives to getaways</small></span></div>
      <div><span className="trust-icon">✓</span><span><strong>Booking history</strong><small>Your trips, all in one place</small></span></div>
    </section>
    <section className="section featured-section">
      <div className="eyebrow">PICK YOUR PACE</div>
      <div className="section-heading-row"><div><h2>Good things come <em>on four wheels.</em></h2><p className="muted">A few favorites to get your plans moving.</p></div><button className="text-button" onClick={onExplore}>View all vehicles <span>→</span></button></div>
      <div className="vehicle-grid">{vehicles.slice(0, 3).map((vehicle, index) => <VehicleCard key={vehicle.id || index} vehicle={vehicle} onBook={() => onBookVehicle(vehicle)} />)}</div>
      {!vehicles.length && <div className="loading-inline">Loading the collection… If this remains empty, start the backend and MongoDB.</div>}
    </section>
    <section className="journey-banner"><div><div className="eyebrow eyebrow-light">YOUR NEXT ADVENTURE</div><h2>Take the scenic route.</h2><p>The best plans start with a full tank and an open mind.</p></div><button className="button button-lime" onClick={onExplore}>Find your car <span>↗</span></button></section>
  </div>;
}

function VehicleCard({ vehicle, onBook, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <article className={`vehicle-card ${compact ? "vehicle-card-compact" : ""}`}>
    <div className="vehicle-image-wrap">
      {vehicle.imageUrl && !imageFailed ? <img src={vehicle.imageUrl} alt={`${vehicle.brand} ${vehicle.model}`} loading="lazy" onError={() => setImageFailed(true)} /> : <div className="vehicle-image-fallback">🚘</div>}
      <span className={`availability ${vehicle.available ? "" : "unavailable"}`}><i />{vehicle.available ? "Available" : "Unavailable"}</span>
      <span className="vehicle-type">{vehicle.type || "Car"}</span>
    </div>
    <div className="vehicle-details">
      <div className="vehicle-title"><div><h3>{vehicle.brand} {vehicle.model}</h3><p>{vehicle.fuelType || "Fuel"} <span>·</span> {vehicle.transmission || "Transmission"}</p></div><div className="vehicle-price"><strong>{money(vehicle.pricePerDay)}</strong><small>/ day</small></div></div>
      <div className="vehicle-specs"><span>♙ {vehicle.seats || 5} seats</span><span>⌁ {vehicle.fuelType || "Fuel"}</span><span>⚙ {vehicle.transmission || "Auto"}</span></div>
      {!compact && <button className="button button-dark button-wide" onClick={onBook} disabled={!vehicle.available}> {vehicle.available ? "Reserve this car" : "Currently unavailable"} <span>↗</span></button>}
    </div>
  </article>;
}

function AuthPage({ mode, onSubmit, loading, onSwitch }) {
  const isRegister = mode === "register";
  return <section className="auth-page">
    <div className="auth-art"><div className="auth-art-content"><div className="eyebrow eyebrow-light">WELCOME TO THE OPEN ROAD</div><h2>Every journey<br />has a <em>beginning.</em></h2><p>Make yours a little easier with DriveEase.</p><div className="auth-road-mark">D<span>R</span>I<span>V</span>E</div></div></div>
    <div className="auth-panel"><div className="auth-form-wrap"><div className="eyebrow">{isRegister ? "JOIN THE JOURNEY" : "GOOD TO SEE YOU AGAIN"}</div><h1>{isRegister ? "Create account." : "Welcome back."}</h1><p className="muted">{isRegister ? "Set up your account and get ready to go." : "Sign in to manage your bookings and get moving."}</p>
      <form className="auth-form" onSubmit={(e) => onSubmit(e, mode)}>
        {isRegister && <label>Full name<input name="name" type="text" placeholder="e.g. Alex Morgan" minLength="2" autoComplete="name" required /></label>}
        <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" placeholder={isRegister ? "At least 8 characters" : "Enter your password"} minLength={isRegister ? 8 : 1} autoComplete={isRegister ? "new-password" : "current-password"} required /></label>
        {isRegister && <p className="form-hint">Use at least 8 characters for your password.</p>}
        <button className="button button-dark button-wide auth-submit" disabled={loading}>{loading ? "Please wait…" : isRegister ? "Create my account" : "Sign in"} <span>↗</span></button>
      </form>
      <p className="auth-switch">{isRegister ? "Already have an account?" : "New to DriveEase?"} <button onClick={() => onSwitch(isRegister ? "login" : "register")}>{isRegister ? "Sign in" : "Create an account"}</button></p>
      <button className="back-link auth-back" onClick={() => onSwitch("home")}>← Back to home</button>
    </div></div>
  </section>;
}

export default App;
