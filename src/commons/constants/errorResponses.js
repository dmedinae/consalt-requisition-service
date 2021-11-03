const ERROR = Object.freeze({
    INTERNAL_ERROR: {
        statusCode: 500,
        status: {
            code: "REQI50",
            message: "Internal Error in the service",
            identifier: null,
            date: null,
        },
    },
    NO_SEARCH_PARAMETERS_FOUND: {
        statusCode: 404,
        status: {
            code: "REQI40",
            message: "No valid parameters for the search",
            identifier: null,
            date: null,
        },
    },
    INVALID_REQUEST: {
        statusCode: 400,
        status: {
            code: "REQI41",
            message: "The suplied parameters are invalid",
            identifier: null,
            date: null,
        },
    },
    UNAUTHORIZE_REQUEST: {
        statusCode: 401,
        status: {
            code: "REQI42",
            message: "You can´t access this function.",
            identifier: null,
            date: null,
        },
    },
    NO_ID_FOUND: {
        statusCode: 422,
        status: {
            code: "REQI42",
            message: "No id REQIster",
            identifier: null,
            date: null,
        },
    },
    NO_NAME_FOUND: {
        statusCode: 422,
        status: {
            code: "REQI43",
            message: "No name REQIster",
            identifier: null,
            date: null,
        },
    },
    NO_SECTOR_FOUND: {
        statusCode: 422,
        status: {
            code: "REQI44",
            message: "No sector REQIster",
            identifier: null,
            date: null,
        },
    },
    REQI_NO_FOUND: {
        statusCode: 422,
        status: {
            code: "REQI45",
            message: "Invalid id of requisition",
            identifier: null,
            date: null,
        },
    },
    ID_FOUND: {
        statusCode: 422,
        status: {
            code: "REQI46",
            message: "Id vendor already exist",
            identifier: null,
            date: null,
        },
    },
});

module.exports = ERROR;
