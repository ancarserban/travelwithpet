export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { origin, destination, date, petWeight } = req.query;

  if (!origin || !destination || !date) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const tokenRes = await fetch('https://api.duffel.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.DUFFEL_TOKEN,
        grant_type: 'client_credentials'
      })
    });

    const searchRes = await fetch('https://api.duffel.com/air/offer_requests', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DUFFEL_TOKEN}`,
        'Content-Type': 'application/json',
        'Duffel-Version': 'v2'
      },
      body: JSON.stringify({
        data: {
          slices: [{
            origin: origin,
            destination: destination,
            departure_date: date
          }],
          passengers: [{ type: 'adult' }],
          cabin_class: 'economy'
        }
      })
    });

    const data = await searchRes.json();

    if (!data.data) {
      return res.status(500).json({ error: 'No data from Duffel', raw: data });
    }

    const offers = data.data.offers || [];

    const petPolicies = {
      'OS': { name: 'Austrian Airlines', cabinAllowed: true, maxWeight: 8, fee: 65, currency: 'EUR' },
      'FR': { name: 'Ryanair', cabinAllowed: false },
      'W6': { name: 'Wizz Air', cabinAllowed: false },
      'BA': { name: 'British Airways', cabinAllowed: false, cargoOnly: true },
      'LH': { name: 'Lufthansa', cabinAllowed: true, maxWeight: 8, fee: 72, currency: 'EUR' },
      'AF': { name: 'Air France', cabinAllowed: true, maxWeight: 8, fee: 125, currency: 'EUR' },
      'KL': { name: 'KLM', cabinAllowed: true, maxWeight: 8, fee: 0, currency: 'EUR' },
      'VY': { name: 'Vueling', cabinAllowed: true, maxWeight: 10, fee: 50, currency: 'EUR' },
      'IB': { name: 'Iberia', cabinAllowed: true, maxWeight: 8, fee: 40, currency: 'EUR' },
      'TP': { name: 'TAP Air Portugal', cabinAllowed: true, maxWeight: 8, fee: 0, currency: 'EUR' },
      'BT': { name: 'airBaltic', cabinAllowed: true, maxWeight: 8, fee: 0, currency: 'EUR' },
    };

    const weight = parseFloat(petWeight) || 8;

    const filtered = offers
      .filter(offer => {
        const carrier = offer.owner?.iata_code;
        const policy = petPolicies[carrier];
        if (!policy) return false;
        if (!policy.cabinAllowed) return false;
        if (policy.maxWeight && weight > policy.maxWeight) return false;
        return true;
      })
      .slice(0, 6)
      .map(offer => {
        const carrier = offer.owner?.iata_code;
        const policy = petPolicies[carrier];
        const slice = offer.slices?.[0];
        return {
          airline: offer.owner?.name,
          iata: carrier,
          origin: slice?.origin?.iata_code,
          destination: slice?.destination?.iata_code,
          duration: slice?.duration,
          price: offer.total_amount,
          currency: offer.total_currency,
          cabinAllowed: policy.cabinAllowed,
          petFee: policy.fee,
          petFeeCurrency: policy.currency
        };
      });

    return res.status(200).json({ offers: filtered });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
