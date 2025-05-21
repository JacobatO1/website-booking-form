import fetch from 'node-fetch';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
    });
  }

  try {
    const submission = await req.json();
    console.log('👉 Raw submission:', JSON.stringify(submission, null, 2));

    const {
      BookingReference,
      AgentsName,
      AgentsEmail,
      PropertyAddress,
      LettingType,
      JobType,
      PropertyType,
      NoOfBedrooms,
      JobDate,
      StartOfTenancy,
      PropertyAvailableDate,
      CompanyName,
      CompanyName2,
      LeadTenantName,
      LeadTenantEmail,
      LeadTenantPhone,
      Comments,
      JobBookedOnBehalfOfTheAgentBy,
      AreYouAFranchiseeBookingOnBehalfOfTheAgent,
    } = submission;

    const itemName = `${BookingReference} - ${PropertyAddress?.FullAddress || ''}`;

    const columnValues = {
      text: BookingReference || '',
      text8: AgentsName || '',
      email: {
        email: AgentsEmail || '',
        text: AgentsEmail || '',
      },
      text9: PropertyAddress?.FullAddress || '',
      dropdown: {
        labels: [LettingType || ''],
      },
      status1: {
        label: JobType || '',
      },
      status: {
        label: PropertyType || '',
      },
      numbers: parseInt(NoOfBedrooms) || 0,
      date4: JobDate ? { date: JobDate } : null,
      date: StartOfTenancy ? { date: StartOfTenancy } : null,
      date3: PropertyAvailableDate ? { date: PropertyAvailableDate } : null,
      text6: CompanyName || '',
      text17: CompanyName2 || '',
      text7: LeadTenantName?.FirstAndLast || '',
      email4: {
        email: LeadTenantEmail || '',
        text: LeadTenantEmail || '',
      },
      phone: {
        phone: LeadTenantPhone || '',
        countryShortName: 'GB',
      },
      long_text: {
        text: Comments || '',
      },
      text13: JobBookedOnBehalfOfTheAgentBy || '',
      status5: {
        label: (AreYouAFranchiseeBookingOnBehalfOfTheAgent ?? '').toString().toLowerCase() === 'true' ? 'Yes' : 'No',
      },
    };

    // Remove null values (e.g. dates)
    Object.keys(columnValues).forEach((key) => {
      if (columnValues[key] === null) {
        delete columnValues[key];
      }
    });

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.MONDAY_API_KEY,
      },
      body: JSON.stringify({
        query: `
          mutation ($boardId: Int!, $itemName: String!, $columnValues: JSON!) {
            create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
              id
            }
          }
        `,
        variables: {
          boardId: parseInt(process.env.MONDAY_BOARD_ID),
          itemName,
          columnValues: JSON.stringify(columnValues),
        },
      }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error('❌ Monday API error:', data.errors);
      return new Response(JSON.stringify({ error: 'Monday API error', details: data.errors }), {
        status: 500,
      });
    }

    console.log('✅ Item created successfully:', data);
    return new Response(JSON.stringify({ success: true, itemId: data.data.create_item.id }), {
      status: 200,
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}
