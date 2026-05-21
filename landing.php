<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TMJ Wedding Check-In System</title>

  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f8f9fa;
      color: #333;
    }

    header {
      background: #000;
      color: #fff;
      padding: 20px;
      text-align: center;
    }

    .hero {
      padding: 70px 20px;
      text-align: center;
      animation: fadeIn 1s ease-in;
    }

    .hero h1 {
      font-size: 36px;
    }

    .hero p {
      font-size: 18px;
      margin: 15px 0;
    }

    .btn {
      background: #ffcc00;
      color: #000;
      padding: 12px 25px;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
    }

    .section {
      padding: 60px 20px;
      text-align: center;
    }

    .features {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 20px;
    }

    .card {
      background: #fff;
      padding: 20px;
      border-radius: 12px;
      width: 260px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      transition: 0.3s;
    }

    .card:hover {
      transform: translateY(-10px);
    }

    .preview {
      width: 90%;
      max-width: 500px;
      border-radius: 12px;
      margin-top: 20px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    }

    form {
      max-width: 400px;
      margin: 20px auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    input, textarea {
      padding: 10px;
      border-radius: 5px;
      border: 1px solid #ccc;
    }

    button {
      padding: 12px;
      border: none;
      background: #000;
      color: #fff;
      border-radius: 5px;
      cursor: pointer;
    }

    footer {
      background: #000;
      color: #fff;
      text-align: center;
      padding: 20px;
    }

    .whatsapp {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #25D366;
      color: #fff;
      padding: 15px;
      border-radius: 50%;
      font-size: 20px;
      text-decoration: none;
    }

    @keyframes fadeIn {
      from {opacity:0;}
      to {opacity:1;}
    }
  </style>
</head>

<body>

<header>
  <h2>TMJ Wedding Tech</h2>
</header>

<section class="hero">
  <h1>Epuka Wageni Feki Kwenye Harusi Yako</h1>
  <p>Tumia QR Code Check-in System kusimamia wageni kwa urahisi</p>
  <a class="btn" href="https://wa.me/255754696878">Wasiliana Sasa</a>
</section>

<section class="section">
  <h2>Live System Preview</h2>
  <p>Manage guests, generate QR, and verify instantly ✅</p>

  <!-- HII NDIO PICHA YAKO -->
  <img class="preview" src="preview.jpg" alt="TMJ System Preview">
</section>

<section class="section">
  <h2>Huduma Tunazotoa</h2>
  <div class="features">
    <div class="card">
      <h3>QR Code Check-in</h3>
      <p>Scan QR ili kuruhusu wageni kuingia haraka</p>
    </div>
    <div class="card">
      <h3>Guest Management</h3>
      <p>Dhibiti orodha ya wageni wako kirahisi</p>
    </div>
    <div class="card">
      <h3>No Fake Guests</h3>
      <p>Hakuna mtu ataingia bila mwaliko halali</p>
    </div>
  </div>
</section>

<section class="section">
  <h2>Bei Zetu</h2>
  <div class="features">
    <div class="card">
      <h3>Basic</h3>
      <p>50,000 Tsh</p>
    </div>
    <div class="card">
      <h3>Standard</h3>
      <p>120,000 Tsh</p>
    </div>
    <div class="card">
      <h3>Premium</h3>
      <p>250,000 Tsh</p>
    </div>
  </div>
</section>

<section class="section">
  <h2>Book Service Sasa</h2>

  <!-- BADILISHA LINK YA FORMSPREE -->
  <form action="https://formspree.io/f/yourformid" method="POST">
    <input type="text" name="name" placeholder="Jina lako" required>
    <input type="tel" name="phone" placeholder="Namba ya simu" required>
    <input type="date" name="event_date" required>
    <textarea name="message" placeholder="Maelezo ya event"></textarea>
    <button type="submit">Tuma Maombi</button>
  </form>
</section>

<section class="section">
  <h2>Wasiliana Nasi</h2>
  <p>Simu: 0754696878</p>
  <p>WhatsApp: 0754696878</p>
</section>

<footer>
  <p>© 2026 TMJ Wedding Tech. All Rights Reserved.</p>
</footer>

<!-- WhatsApp Floating Button -->
<a class="whatsapp" href="https://wa.me/255754696878">💬</a>

</body>
</html>