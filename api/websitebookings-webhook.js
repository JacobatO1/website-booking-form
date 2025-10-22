const MONDAY_API_KEY = process.env.MONDAY_FRANCHISE_API_KEY;
const MAIN_BOARD_ID = 2046517792;
const MONDAY_GROUP_ID = "new_group29179"; // ✅ Updated group ID

const FRANCHISEE_BOARDS = {
    "Franchisee A": 0,
    "Franchisee B": 0,
};

const mondayCall = async (query, variables = {}) => {
    const response = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: MONDAY_API_KEY,
        },
        body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    if (data.errors) {
        console.error("❌ Monday API returned errors:", JSON.stringify(data.errors, null, 2));
        throw new Error(`Monday API Error: ${data.errors[0].message}`);
    }
    return data.data;
};

module.exports = async (req, res) => {
    if (!MONDAY_API_KEY) {
        console.error("❌ MONDAY_API_KEY not set!");
        return res.status(500).json({ error: "Missing Monday API Key" });
    }

    if (req.method === "GET") return res.status(200).json({ message: "✅ Webhook online" });
    if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

    try {
        const submission = req.body;

        const {
            BookingReference, JobDate, PropertyAddress, EstateAgency, EstateAgency2,
            BookingType, NoOfBedrooms, PropertyType, PropertyAvailableDate, StartOfTenancy,
            Id, Comments, AgentsName, AgentsEmail, LettingType, LeadTenantName,
            LeadTenantEmail, LeadTenantPhone, Price, AreYouAFranchiseeBookingOnBehalfOfTheAgent,
            JobBookedOnBehalfOfTheAgentBy,
        } = submission;

        const itemName = `${BookingReference}`;
        let boardId = MAIN_BOARD_ID;

        const franchiseeAnswer =
            typeof AreYouAFranchiseeBookingOnBehalfOfTheAgent === "string"
                ? AreYouAFranchiseeBookingOnBehalfOfTheAgent.toLowerCase()
                : AreYouAFranchiseeBookingOnBehalfOfTheAgent === true
                    ? "yes"
                    : "no";

        if (franchiseeAnswer === "yes" && JobBookedOnBehalfOfTheAgentBy) {
            const franchiseeName = JobBookedOnBehalfOfTheAgentBy.trim();
            if (FRANCHISEE_BOARDS[franchiseeName] && FRANCHISEE_BOARDS[franchiseeName] !== 0) {
                boardId = FRANCHISEE_BOARDS[franchiseeName];
            } else {
                console.warn(`⚠️ No valid board mapping found for ${franchiseeName}, using main board.`);
            }
        }

        const columnValues = {
            date_mkvmvx73: { date: JobDate },
            text_mkvmjq0e: [
                PropertyAddress?.Line1,
                PropertyAddress?.City,
                PropertyAddress?.PostalCode,
            ].filter(Boolean).join(", "),
            color_mkvmxaw7: { label: EstateAgency },
            text_mkvn2yd1: EstateAgency2 || "",
            color_mkvta8zc: { label: BookingType },
            numeric_mkvng45g: NoOfBedrooms?.toString() || "",
            text_mkvn9w2j: PropertyType,
            date_mkvna7n0: PropertyAvailableDate ? { date: PropertyAvailableDate } : null,
            date_mkvn9hrb: StartOfTenancy ? { date: StartOfTenancy } : null,
            numbers23: Id?.toString() || "",
            text_mkvn7ezz: Comments || "",
            text_mkvnwr1x: AgentsName,
            email_mkvnbepp: { email: AgentsEmail, text: AgentsEmail },
            text_mkvnw80g: LettingType,
            text_mkvndvdh: LeadTenantName?.FirstAndLast || "",
            email_mkvnphs3: { email: LeadTenantEmail, text: LeadTenantEmail },
            phone_mkvn19xx: { phone: LeadTenantPhone, countryShortName: "GB" },
            numeric_mkvnx5tt: Price ? parseFloat(Price.replace(/[^0-9.]/g, "")) : 0,
            color_mkvmmvy7: JobBookedOnBehalfOfTheAgentBy,
        };

        Object.keys(columnValues).forEach((key) => columnValues[key] == null && delete columnValues[key]);
        const columnValuesJson = JSON.stringify(columnValues);

        const searchQuery = `
        query ($boardId: ID!, $itemName: String!) {
            items_page_by_column_values(
                board_id: $boardId,
                columns: [{ column_id: "name", column_values: [$itemName] }],
                limit: 1
            ) {
                items {
                    id
                }
            }
        }`;

        const searchData = await mondayCall(searchQuery, {
            boardId: boardId,
            itemName: itemName,
        });

        const existingItem = searchData?.items_page_by_column_values?.items?.[0];

        if (existingItem) {
            const updateQuery = `
            mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
                change_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
                    id
                }
            }`;

            const updateData = await mondayCall(updateQuery, {
                boardId: boardId,
                itemId: parseInt(existingItem.id),
                columnValues: columnValuesJson,
            });

            console.log("✏️ Updated existing item:", updateData.change_column_values.id);
            return res.status(200).json({ message: "✅ Updated existing item", id: existingItem.id });
        } else {
            const createQuery = `
            mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
                create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
                    id
                }
            }`;

            const createData = await mondayCall(createQuery, {
                boardId: boardId,
                groupId: MONDAY_GROUP_ID,
                itemName: itemName,
                columnValues: columnValuesJson,
            });

            console.log("➕ Created new item:", createData.create_item.id);
            return res.status(200).json({ message: "✅ Created new item", id: createData.create_item.id });
        }

    } catch (error) {
        console.error("❌ Fatal Webhook Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
