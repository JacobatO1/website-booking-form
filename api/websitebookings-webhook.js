const MONDAY_API_KEY = process.env.MONDAY_FRANCHISE_API_KEY;

const MAIN_BOARD_ID = 2046517792;
const MONDAY_GROUP_ID = "topics";

const FRANCHISEE_BOARDS = {
  "Franchisee A": 1234567890,
  "Franchisee B": 9876543210,
};

console.log("MONDAY_FRANCHISE_API_KEY exists:", !!MONDAY_FRANCHISE_API_KEY);

module.exports = async (req, res) => {
if (req.method === "GET") {
  return res.status(200).json({ message: "✅ Webhook online" });
}

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const submission = req.body;
    console.log("👉 Raw submission:", JSON.stringify(submission, null, 2));

    const {
      BookingReference,
      JobDate,
      PropertyAddress,
      EstateAgency,
      EstateAgency2,
      BookingType,
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

    let boardId = MAIN_BOARD_ID;
    const franchiseeAnswer =
      typeof AreYouAFranchiseeBookingOnBehalfOfTheAgent === "string"
        ? AreYouAFranchiseeBookingOnBehalfOfTheAgent.toLowerCase()
        : AreYouAFranchiseeBookingOnBehalfOfTheAgent?.Choice?.toLowerCase() || "no";

    if (franchiseeAnswer === "yes" && JobBookedOnBehalfOfTheAgentBy) {
      const franchiseeName = JobBookedOnBehalfOfTheAgentBy.trim();
      if (FRANCHISEE_BOARDS[franchiseeName]) {
        boardId = FRANCHISEE_BOARDS[franchiseeName];
      } else {
        console.warn(`⚠️ No board mapping found for franchisee: ${franchiseeName}, using MAIN_BOARD_ID.`);
      }
    }

    const columnValues = {
      date_mkvmvx73: { date: JobDate },
      text_mkvmjq0e: [
        PropertyAddress?.Line1,
        PropertyAddress?.City,
        PropertyAddress?.PostalCode
      ].filter(Boolean).join(', '),
      color_mkvmxaw7: { label: EstateAgency },
      text_mkvn2yd1: EstateAgency2 || "",
      color_mkvta8zc: { label: BookingType },
      numeric_mkvng45g: NoOfBedrooms?.toString() || "",
      text_mkvn9w2j: PropertyType,
      date_mkvna7n0: PropertyAvailableDate ? { date: PropertyAvailableDate } : null,
      date_mkvn9hrb: StartOfTenancy ? { date: StartOfTenancy } : null,
      numbers23: Id?.toString() || "",
      text_mkvn7ezz: { text: Comments || "" },
      text_mkvnwr1x: AgentsName,
      email_mkvnbepp: { email: AgentsEmail, text: AgentsEmail },
      text_mkvnw80g: LettingType,
      text_mkvndvdh: LeadTenantName?.FirstAndLast || "",
      email_mkvnphs3: { email: LeadTenantEmail, text: LeadTenantEmail },
      phone_mkvn19xx: { phone: LeadTenantPhone, countryShortName: "GB" },
      numeric_mkvnx5tt: Price ? parseFloat(Price.replace(/[^0-9.]/g, "")) : 0,
      color_mkvmmvy7: JobBookedOnBehalfOfTheAgentBy
      };

    Object.keys(columnValues).forEach(
      key => columnValues[key] == null && delete columnValues[key]
    );

    // 🔍 Check if item exists
    const searchQuery = `
      query {
        items_by_column_values(
          board_id: ${boardId},
          column_id: "name",
          column_value: "${itemName.replace(/"/g, '\\"')}"
        ) {
          id
        }
      }
    `;

    const searchResponse = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MONDAY_API_KEY
      },
      body: JSON.stringify({ query: searchQuery })
    });

    const searchData = await searchResponse.json();
    const existingItem = searchData?.data?.items_by_column_values?.[0];

    if (existingItem) {
      // ✏️ Update existing item
      const updateQuery = `
        mutation {
          change_column_values(
            board_id: ${boardId},
            item_id: ${existingItem.id},
            column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
          ) {
            id
          }
        }
      `;

      const updateResponse = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: MONDAY_API_KEY
        },
        body: JSON.stringify({ query: updateQuery })
      });

      const updateData = await updateResponse.json();
      console.log("✏️ Updated item:", JSON.stringify(updateData, null, 2));

      return res.status(200).json({
        message: "✅ Item successfully updated in Monday.com",
        itemId: updateData.data.change_column_values.id
      });
    } else {
      // ➕ Create new item
      const createQuery = `
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

      const createResponse = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: MONDAY_API_KEY
        },
        body: JSON.stringify({ query: createQuery })
      });

      const createData = await createResponse.json();
      console.log("➕ Created new item:", JSON.stringify(createData, null, 2));

      return res.status(200).json({
        message: "✅ New item successfully created in Monday.com",
        itemId: createData.data.create_item.id
      });
    }

  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
