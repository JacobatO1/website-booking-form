export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const submission = req.body;
    console.log('👉 Raw submission:', JSON.stringify(submission, null, 2));

    const boardId = process.env.MONDAY_BOARD_ID;
    const apiKey = process.env.MONDAY_API_KEY;

    const columnValues = {
      booking_reference: submission.BookingReference || '',
      agent_name: submission.AgentsName || '',
      agent_email: submission.AgentsEmail || '',
      agent_email_2: submission.AgentsEmail2 || '',
      job_type: submission.JobType || '',
      property_type: submission.PropertyType || '',
      property_address: submission.PropertyAddress?.FullAddress || '',
      no_of_bedrooms: submission.NoOfBedrooms || '',
      letting_type: submission.LettingType || '',
      job_date: submission.JobDate || '',
      start_of_tenancy: submission.StartOfTenancy || '',
      property_available_date: submission.PropertyAvailableDate || '',
      lead_tenant_name: submission.LeadTenantName?.FirstAndLast || '',
      lead_tenant_email: submission.LeadTenantEmail || '',
      lead_tenant_phone: submission.LeadTenantPhone || '',
      comments: submission.Comments || '',
      job_booked_by: submission.JobBookedOnBehalfOfTheAgentBy || '',
      pricing_note: submission.PricingNote || '',
      company_name: submission.CompanyName || '',
      company_name_2: submission.CompanyName2 || '',
      franchisee_booking: typeof submission.AreYouAFranchiseeBookingOnBehalfOfTheAgent === 'boolean'
        ? submission.AreYouAFranchiseeBookingOnBehalfOfTheAgent.toString()
        : '',
      cognito_entry_url: submission.Entry?.PublicLink || '',
    };

    const itemName = `${submission.JobType || 'Job'} - ${submission.PropertyAddress?.FullAddress || 'No address'}`;

    const mutation = `
      mutation {
        create_item (
          board_id: ${boardId},
          item_name: "${itemName}",
          column_values: ${JSON.stringify(JSON.stringify(columnValues))}
        ) {
          id
        }
      }
    `;

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: mutation }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error('❌ Monday API errors:', data.errors);
      return res.status(500).json({ error: 'Monday API error', details: data.errors });
    }

    console.log('✅ Item created:', data.data.create_item.id);
    return res.status(200).json({ success: true, itemId: data.data.create_item.id });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
