"use strict";

const Constants = require("../../commons/constants/objects");
const { BaseDao, BaseObject } = require("@inlaweb/base-node");

/**
 * Service class.
 * @extends BaseObject
 */
class Service extends BaseObject {
    /**
     * Create a Service.
     */
    constructor() {
        super();
        this.dao = new BaseDao();
        this.table = process.env.TABLE_NAME;
    }

    /**
     * Initialize the variables.
     * @param {object} event - The event object.
     * @param {object} context - The context object.
     */
    initialize(event, context) {
        super.initialize(event, context);
        this.dao.initialize(event, context);
    }

    /**
     * Function to save a item.
     * @return {object} The object with the respective PK.
     */
    async inCreated() {
        try {
            const transactionOperations = [];
            // Se consulta la requisición actual y sus items
            const params = {
                indexName: "",
                parameters: [{ name: "PK", value: this.event.requisition, operator: "=" }],
            };
            const currentRequisition = await this.dao.query(this.table, params);
            if (!currentRequisition.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            const header = currentRequisition.find(elem => elem.PK === elem.SK);
            const items = currentRequisition.filter(elem => elem.PK !== elem.SK);
            const associatePK = this.event.in;

            header.associateIn ? header.associateIn.push(associatePK) : [associatePK];

            for (let item of this.event.items) {
                const currentItem = items.find(elem => elem.item === item.item);
                currentItem.associateIn ? currentItem.associateIn.push(associatePK) : [associatePK];
                currentItem.associateQuantity = currentItem.associateQuantity ? currentItem.associateQuantity += item.quantity : item.quantity;
                if (currentItem.associateQuantity === currentItem.quantity) {
                    currentItem.relation3 = currentItem.relation3.replace(header.status, Constants.STATUS.CLOSED);
                    currentItem.relation4 = currentItem.relation4 ? currentItem.relation4.replace(header.status, Constants.STATUS.CLOSED) : undefined;
                }
                transactionOperations.push(this.createItemUpdateOperationIn(currentItem, header.PK));
            }

            const openItems = items.filter(item => !item.relation3.includes(`${Constants.STATUS.CLOSED}|`));

            if (!openItems.length) {
                header.relation3 = header.relation3.replace(Constants.STATUS.PROCCESS, Constants.STATUS.CLOSED);
                header.relation4 = header.relation4 ? header.relation4.replace(Constants.STATUS.PROCCESS, Constants.STATUS.CLOSED) : undefined;
                header.status = Constants.STATUS.CLOSED;
            }

            transactionOperations.push(this.createRequisitionObjectIn(header))

            await this.dao.writeTransactions(transactionOperations, 24);
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw error;
        }
    }

    async outCreated() {
        try {
            const transactionOperations = [];

            const params = {
                indexName: "",
                parameters: [{ name: "PK", value: this.event.requisition, operator: "=" }],
            };
            const currentRequisition = await this.dao.query(this.table, params);
            if (!currentRequisition.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            const header = currentRequisition.find(elem => elem.PK === elem.SK);
            const items = currentRequisition.filter(elem => elem.PK !== elem.SK);
            const associatePK = this.event.out;

            header.associateOut ? header.associateOut.push(associatePK) : [associatePK];

            for (let item of this.event.items) {
                const currentItem = items.find(elem => elem.item === item.item);
                currentItem.associateOut ? currentItem.associateOut.push(associatePK) : [associatePK];
                transactionOperations.push(this.createItemUpdateOperationOut(currentItem, header.PK));
            }

            transactionOperations.push(this.createRequisitionObjectOut(header))

            await this.dao.writeTransactions(transactionOperations, 24);
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw error;
        }
    }

    createItemUpdateOperationIn(item, PK) {
        const itemUpdate = {
            relation3: item.relation3,
            relation4: item.relation4,
            associateIn: item.associateIn,
            associateQuantity: item.associateQuantity,
        };
        const setAttributes = Object.keys(itemUpdate);
        return this.dao.createUpdateParams(this.table, PK, item.SK, itemUpdate, setAttributes);
    }

    createRequisitionObjectIn(payload) {
        const item = {
            relation3: payload.relation3,
            relation4: payload.relation4,
            status: payload.status,
            associateIn: payload.associateIn,
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, payload.PK, payload.PK, item, setAttributes);
    }

     createItemUpdateOperationOut(item, PK) {
        const itemUpdate = {
            associateOut: item.associateOut,
        };
        const setAttributes = Object.keys(itemUpdate);
        return this.dao.createUpdateParams(this.table, PK, item.SK, itemUpdate, setAttributes);
    }

    createRequisitionObjectOut(payload) {
        const item = {
            associateOut: payload.associateOut,
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, payload.PK, payload.PK, item, setAttributes);
    }
}

module.exports = Service;
