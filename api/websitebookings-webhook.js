const MONDAY_API_KEY = process.env.MONDAY_API_KEY;

// Default board and group
const DEFAULT_BOARD_ID = 1556561593;
const MONDAY_GROUP_ID = "topics";

// Optional: Map franchisee names to their Monday board IDs
const franchiseBoardMap = {
  "Franchisee A": 1234567890,
  "Franchisee B": 2345678901,
  "Franchisee C": 3456789012
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const submission = req.body;

    // ✅ Extract relevant fields
    const {
      BookingReference,
      JobDate,
      PropertyAddress,
      CompanyName,
      CompanyName2,
      JobType,
      NoOfBedrooms,
      PropertyType,
      PropertyAvailableDate,
      StartOfTenancy,
      Id,
      Comments,
      AgentsName,
      AgentsEmail,
      LettingType,
      LeadTenantName,
      LeadTenantEmail,
      LeadTenantPhone,
      Price,
      AreYouAFranchiseeBookingOnBehalfOfTheAgent,
      JobBookedOnBehalfOfTheAgentBy
    } = submission;

    const itemName = `${BookingReference}`;

    // ✅ Build column values
    const columnValues = {
      date: { date: JobDate },
      text05: PropertyAddress?.FullAddress || "",
      status_1: { label: CompanyName },
      text17: CompanyName2 || "", // ✅ Added field
      job_type: { label: JobType },
      no__bedrooms: NoOfBedrooms?.toString() || "",
      text0: PropertyType,
      date5: PropertyAvailableDate ? { date: PropertyAvailableDate } : null,
      date1: StartOfTenancy ? { date: StartOfTenancy } : null,
      numbers23: Id?.toString() || "",
      long_text: { text: Comments || "" },
      text: AgentsName,
      email: { email: AgentsEmail, text: AgentsEmail },
      text33: LettingType,
      text1: LeadTenantName?.FirstAndLast || "",
      email9: { email: LeadTenantEmail, text: LeadTenantEmail },
      phone: { phone: LeadTenantPhone, countryShortName: "GB" },
      numbers2: parseFloat(Price?.replace(/[^0-9.]/g, "")) || 0
    };

    // ✅ Clean nulls (to avoid Monday.com API errors)
    Object.keys(columnValues).forEach(
      key => columnValues[key] == null && delete columnValues[key]
    );

    // ✅ Determine board ID
    let boardId = DEFAULT_BOARD_ID;

    if (
      AreYouAFranchiseeBookingOnBehalfOfTheAgent?.toLowerCase() === "yes" &&
      JobBookedOnBehalfOfTheAgentBy &&
      franchiseBoardMap[JobBookedOnBehalfOfTheAgentBy]
    ) {
      boardId = franchiseBoardMap[JobBookedOnBehalfOfTheAgentBy];
    }

    // ✅ GraphQL mutation
    const query = `
      mutation {
        create_item(
          board_id: ${boardId},
          group_id: "${MONDAY_GROUP_ID}",
          item_name: "${itemName.replace(/"/g, '\\"')}",
          column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
        ) {
          id
        }
      }
    `;

    // ✅ Send request
    const response = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MONDAY_API_KEY
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    console.log("📬 Monday.com response:", JSON.stringify(data, null, 2));

    if (data.errors) {
      return res.status(500).json({ message: "Monday.com API error", errors: data.errors });
    }

    res.status(200).json({
      message: "✅ Item successfully created in Monday.com",
      itemId: data.data.create_item.id
    });

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
