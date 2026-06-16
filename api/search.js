export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { origin, destination, date, returnDate, petWeight } = req.query;

  if (!origin || !destination || !date) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const petPolicies = {
    'OS': { name: 'Austrian Airlines', cabinAllowed: true, maxWeight: 8, fee: 65, currency: 'EUR' },
    'FR': { name: 'Ryanair', cabinAllowed: false },
    'W6': { name: 'Wizz Air', cabinAllowed: false },
    'BA': { name: 'British Airways', cabinAllowed: false },
    'U2': { name: 'easyJet', cabinAllowed: false },
    'LH': { name: 'Lufthansa', cabinAllowed: true, maxWeight: 8, fee: 72, currency: 'EUR' },
    'AF': { name: 'Air France', cabinAllowed: true, maxWeight: 8, fee: 125, currency: 'EUR' },
    'KL': { name: 'KLM', cabinAllowed: true, maxWeight: 8, fee: 50, currency: 'EUR' },
    'VY': { name: 'Vueling', cabinAllowed: true, maxWeight: 10, fee: 50, currency: 'EUR' },
    'IB': { name: 'Iberia', cabinAllowed: true, maxWeight: 8, fee: 40, currency: 'EUR' },
    'TP': { name: 'TAP Air Portugal', cabinAllowed: true, maxWeight: 8, fee: 45, currency: 'EUR' },
    'BT': { name: 'airBaltic', cabinAllowed: true, maxWeight: 8, fee: 50, currency: 'EUR' },
    'AZ': { name: 'ITA Airways', cabinAllowed: true, maxWeight: 10, fee: 50, currency: 'EUR' },
    'SK': { name: 'SAS', cabinAllowed: true, maxWeight: 8, fee: 60, currency: 'EUR' },
    'AY': { name: 'Finnair', cabinAllowed: true, maxWeight: 8, fee: 60, currency: 'EUR' },
    'LO': { name: 'LOT Polish Airlines', cabinAllowed: true, maxWeight: 8, fee: 40, currency: 'EUR' },
    'OK': { name: 'Czech Airlines', cabinAllowed: true, maxWeight: 8, fee: 40, currency: 'EUR' },
    'RO': { name: 'TAROM', cabinAllowed: true, maxWeight: 8, fee: 30, currency: 'EUR' },
  };

  try {
    const slices = [{ origin, destination, departure_date: date }];
    if (returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    }

    const searchRes = await fetch('https://api.duffel.com/air/offer_requests', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DUFFEL_TOKEN}`,
        'Content-Type': 'application/json',
        'Duffel-Version': 'v2'
      },
      body: JSON.stringify({
        data: {
          slices,
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
    const weight = parseFloat(petWeight) || 8;
    const isRoundTrip = !!returnDate;

    const filtered = offers
      .filter(offer => {
        const carrier = offer.owner?.iata_code;
        const policy = petPolicies[carrier];
        if (!policy || !policy.cabinAllowed) return false;
        if (policy.maxWeight && weight > policy.maxWeight) return false;
        return true;
      })
      .slice(0, 6)
      .map(offer => {
        const carrier = offer.owner?.iata_code;
        const policy = petPolicies[carrier];
        const outbound = offer.slices?.[0];
        const inbound = offer.slices?.[1];
        return {
          airline: offer.owner?.name,
          iata: carrier,
          origin: outbound?.origin?.iata_code,
          destination: outbound?.destination?.iata_code,
          duration: outbound?.duration,
          returnDuration: inbound?.duration,
          price: offer.total_amount,
          currency: offer.total_currency,
          cabinAllowed: true,
          petFee: isRoundTrip ? (policy.fee * 2) : policy.fee,
          petFeeCurrency: policy.currency,
          isRoundTrip,
          stops: (outbound?.segments?.length || 1) - 1
        };
      });

    return res.status(200).json({ offers: filtered, isRoundTrip });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
